import type { CallEdge, EdgeTarget, ExternalReason, FunctionNode, ParsedFile } from "./types.js";
import { buildSymbolTable, type FileSymbolTable } from "./buildSymbolTable.js";
import { resolveModule, type ResolverConfig } from "./resolveModule.js";

export interface ProjectIndex {
  filesByPath: Map<string, ParsedFile>;
  symbolTables: Map<string, FileSymbolTable>;
}

export function buildProjectIndex(files: ParsedFile[]): ProjectIndex {
  return {
    filesByPath: new Map(files.map((f) => [f.filePath, f])),
    symbolTables: new Map(files.map((f) => [f.filePath, buildSymbolTable(f)])),
  };
}

function external(label: string, reason: ExternalReason): EdgeTarget {
  return { type: "external", label, reason };
}

/**
 * Follows export chains to find the actual FunctionNode an exported name points to.
 * Handles direct exports, aliased re-exports (`export { a as b } from './y'`), and
 * wildcard re-exports (`export * from './y'`) — recursing through each until found
 * or exhausted. `visited` guards against circular re-export chains (rare, but real
 * codebases do have them via barrel files that accidentally form cycles).
 */
function resolveExportedFunction(
  filePath: string,
  exportedName: string,
  index: ProjectIndex,
  config: ResolverConfig,
  visited: Set<string> = new Set()
): FunctionNode | null {
  const key = `${filePath}::${exportedName}`;
  if (visited.has(key)) return null;
  visited.add(key);

  const file = index.filesByPath.get(filePath);
  if (!file) return null;

  // export function foo() {} / export { foo }
  const direct = file.exports.find((e) => e.exportedName === exportedName && e.source === null);
  if (direct?.localName) {
    return file.functions.find((f) => f.name === direct.localName) ?? null;
  }

  // export { a as exportedName } from './y'
  const reExport = file.exports.find((e) => e.exportedName === exportedName && e.source !== null);
  if (reExport?.source) {
    const resolved = resolveModule(filePath, reExport.source, config);
    if (resolved.type !== "relative") return null; // re-exported through an external package — can't trace further
    return resolveExportedFunction(resolved.resolvedPath, reExport.localName ?? exportedName, index, config, visited);
  }

  // export * from './y' — try each wildcard source until one has the name
  for (const w of file.exports.filter((e) => e.exportedName === "*" && e.source !== null)) {
    const resolved = resolveModule(filePath, w.source!, config);
    if (resolved.type !== "relative") continue;
    const found = resolveExportedFunction(resolved.resolvedPath, exportedName, index, config, visited);
    if (found) return found;
  }

  return null;
}

export function resolveAllCalls(files: ParsedFile[], config: ResolverConfig): CallEdge[] {
  const index = buildProjectIndex(files);
  const edges: CallEdge[] = [];

  for (const file of files) {
    const table = index.symbolTables.get(file.filePath)!;

    for (const call of file.calls) {
      // A call outside any tracked function (module-level side effects) isn't a
      // function-to-function edge — skip it for the dependency graph.
      if (!call.callerId) continue;

      // --- Member call: obj.foo() ---
      if (call.objectName) {
        const objectEntry = table.get(call.objectName);

        if (objectEntry?.kind === "imported" && objectEntry.importKind === "namespace") {
          // import * as ns from './utils'; ns.helper() — fully traceable.
          const resolved = resolveModule(file.filePath, objectEntry.source, config);
          if (resolved.type === "relative") {
            const targetFn = resolveExportedFunction(resolved.resolvedPath, call.calleeName, index, config);
            edges.push({
              from: call.callerId,
              to: targetFn
                ? { type: "resolved", functionId: targetFn.id }
                : external(`${call.objectName}.${call.calleeName}`, "unresolved-export"),
              line: call.line,
            });
          } else if (resolved.type === "external") {
            edges.push({ from: call.callerId, to: external(`${objectEntry.source}.${call.calleeName}`, "npm-package"), line: call.line });
          } else {
            edges.push({ from: call.callerId, to: external(objectEntry.source, "unresolved-import"), line: call.line });
          }
          continue;
        }

        // obj is a local variable/class instance, or unrecognized — this.foo(),
        // instance.method(), etc. Real resolution needs type information we don't have.
        edges.push({ from: call.callerId, to: external(`${call.objectName}.${call.calleeName}`, "method-heuristic"), line: call.line });
        continue;
      }

      // --- Direct call: foo() ---
      const entry = table.get(call.calleeName);
      if (!entry) {
        // Not declared or imported in this file at all — a global/builtin
        // (console.log, fetch, setTimeout) or a genuinely undefined reference.
        edges.push({ from: call.callerId, to: external(call.calleeName, "unresolved-identifier"), line: call.line });
        continue;
      }

      if (entry.kind === "local") {
        edges.push({ from: call.callerId, to: { type: "resolved", functionId: entry.functionNode.id }, line: call.line });
        continue;
      }

      // entry.kind === "imported"
      const resolved = resolveModule(file.filePath, entry.source, config);
      if (resolved.type === "external") {
        edges.push({ from: call.callerId, to: external(`${entry.source}#${entry.importedName ?? entry.name}`, "npm-package"), line: call.line });
      } else if (resolved.type === "unresolved") {
        edges.push({ from: call.callerId, to: external(entry.source, "unresolved-import"), line: call.line });
      } else {
        const targetFn = resolveExportedFunction(resolved.resolvedPath, entry.importedName ?? entry.name, index, config);
        edges.push({
          from: call.callerId,
          to: targetFn
            ? { type: "resolved", functionId: targetFn.id }
            : external(`${entry.source}#${entry.importedName ?? entry.name}`, "unresolved-export"),
          line: call.line,
        });
      }
    }
  }

  return edges;
}
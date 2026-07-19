import type { FunctionNode, ParsedFile, ImportBinding } from "./types.js";

export type SymbolTableEntry =
  | { kind: "local"; name: string; functionNode: FunctionNode }
  | { kind: "imported"; name: string; source: string; importedName: string | null; importKind: ImportBinding["kind"] };

/** Keyed by the name as referenced *within this file* (i.e. post local-alias for imports). */
export type FileSymbolTable = Map<string, SymbolTableEntry>;

/**
 * Consolidates a file's local function declarations and its imported bindings into
 * one lookup table, keyed by local name. This is what call resolution will query:
 * "the file calls `foo()` — is `foo` local, or imported from somewhere?"
 *
 * NOTE — known limitation: this is a flat, file-scoped table, not a real lexical
 * scope tree. It doesn't account for shadowing (e.g. a parameter or local variable
 * reusing an imported name inside one function). That's a deliberate simplification —
 * true scope-correct resolution needs a scope tree (tree-sitter's `locals.scm`
 * convention does this in editors). For dependency-graph purposes this heuristic is
 * standard and fine; just know shadowed calls can occasionally misattribute.
 */
export function buildSymbolTable(parsed: ParsedFile): FileSymbolTable {
  const table: FileSymbolTable = new Map();

  // Local functions first.
  for (const fn of parsed.functions) {
    if (fn.name === "<anonymous>") continue;
    // If two local functions share a name (different block scopes — rare but legal),
    // last one wins. Same flat-scope caveat as above.
    table.set(fn.name, { kind: "local", name: fn.name, functionNode: fn });
  }

  // Imports layered on top. Local declarations take precedence if there's ever a
  // clash (shouldn't happen in valid JS/TS — duplicate top-level bindings are a
  // syntax error — but defensive here in case of parse quirks on unusual code).
  for (const imp of parsed.imports) {
    if (imp.kind === "side-effect" || !imp.localName) continue;
    if (table.has(imp.localName)) continue;
    table.set(imp.localName, {
      kind: "imported",
      name: imp.localName,
      source: imp.source,
      importedName: imp.importedName,
      importKind: imp.kind,
    });
  }

  return table;
}
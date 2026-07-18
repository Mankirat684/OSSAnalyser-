import type { Node } from "web-tree-sitter";
import type { ImportBinding, ExportBinding } from "./types.js";

/** Pulls the literal string value out of a `string` node (strips quotes). */
function stringNodeValue(node: Node | null): string | null {
  if (!node) return null;
  const fragment = node.namedChildren.find((c) => c?.type === "string_fragment");
  if (fragment) return fragment.text;
  // fallback: strip surrounding quote characters
  return node.text.replace(/^['"`]/, "").replace(/['"`]$/, "");
}

function line(node: Node): number {
  return node.startPosition.row + 1;
}

/**
 * Extracts every import binding from the file.
 * Handles: default, named (incl. aliased), namespace, side-effect-only imports.
 * Does NOT resolve `source` to an actual file path — that's a separate module-resolution step.
 */
export function extractImports(root: Node): ImportBinding[] {
  const imports: ImportBinding[] = [];
  const statements = root.descendantsOfType("import_statement");

  for (const stmt of statements) {
    if (!stmt) continue;
    const source = stringNodeValue(stmt.childForFieldName("source"));
    if (!source) continue;

    const clause = stmt.namedChildren.find((c) => c?.type === "import_clause");
    if (!clause) {
      // Side-effect import: import './polyfill';
      imports.push({ source, kind: "side-effect", importedName: null, localName: null, line: line(stmt) });
      continue;
    }

    for (const child of clause.namedChildren) {
      if (!child) continue;

      if (child.type === "identifier") {
        // Default import: import foo from '...'
        imports.push({ source, kind: "default", importedName: "default", localName: child.text, line: line(stmt) });
      } else if (child.type === "namespace_import") {
        // import * as foo from '...'
        const nameNode = child.namedChildren.find((c) => c?.type === "identifier");
        if (nameNode) {
          imports.push({ source, kind: "namespace", importedName: "*", localName: nameNode.text, line: line(stmt) });
        }
      } else if (child.type === "named_imports") {
        // import { a, b as c } from '...'
        for (const spec of child.namedChildren) {
          if (!spec || spec.type !== "import_specifier") continue;
          const nameNode = spec.childForFieldName("name");
          const aliasNode = spec.childForFieldName("alias");
          if (!nameNode) continue;
          imports.push({
            source,
            kind: "named",
            importedName: nameNode.text,
            localName: aliasNode ? aliasNode.text : nameNode.text,
            line: line(stmt),
          });
        }
      }
    }
  }

  return imports;
}

/** Gets the declared name from a function/class/variable declaration node. */
function declarationName(decl: Node): string | null {
  switch (decl.type) {
    case "function_declaration":
    case "class_declaration":
    case "generator_function_declaration": {
      const nameNode = decl.childForFieldName("name");
      return nameNode ? nameNode.text : null;
    }
    case "lexical_declaration":
    case "variable_declaration": {
      // NOTE: only grabs the first declarator. `export const a = 1, b = 2;`
      // will only produce an export binding for `a`. Rare in practice, but
      // worth knowing — split multi-declarator exports upstream if you hit this.
      const declarator = decl.namedChildren.find((c) => c?.type === "variable_declarator");
      const nameNode = declarator?.childForFieldName("name");
      return nameNode ? nameNode.text : null;
    }
    default:
      return null;
  }
}

/**
 * Extracts every export binding from the file.
 * Handles: `export function/class/const ...`, `export default ...`,
 * `export { a, b as c }`, `export { a } from './y'`, `export * from './y'`,
 * `export * as ns from './y'`.
 */
export function extractExports(root: Node): ExportBinding[] {
  const exports: ExportBinding[] = [];
  const statements = root.descendantsOfType("export_statement");

  for (const stmt of statements) {
    if (!stmt) continue;
    const source = stringNodeValue(stmt.childForFieldName("source"));
    const isDefault = stmt.children.some((c) => c?.type === "default");

    // export function foo() {} / export class Foo {} / export const x = ...
    const declaration = stmt.childForFieldName("declaration");
    if (declaration) {
      const name = declarationName(declaration);
      if (name) {
        exports.push({
          exportedName: isDefault ? "default" : name,
          localName: name,
          source: null,
          isDefault,
          line: line(stmt),
        });
      }
      continue;
    }

    // export default <expression>;  e.g. export default someIdentifier;
    if (isDefault) {
      const expr = stmt.namedChildren.find((c) => c && c.type !== "export_clause");
      exports.push({
        exportedName: "default",
        localName: expr?.type === "identifier" ? expr.text : null,
        source: null,
        isDefault: true,
        line: line(stmt),
      });
      continue;
    }

    // export * from './y'  or  export * as ns from './y'
    const hasStar = stmt.children.some((c) => c?.type === "*");
    if (hasStar) {
      const nsNode = stmt.childForFieldName("name");
      exports.push({
        exportedName: nsNode ? nsNode.text : "*",
        localName: null,
        source,
        isDefault: false,
        line: line(stmt),
      });
      continue;
    }

    // export { a, b as c } [from './y']
    const clause = stmt.namedChildren.find((c) => c?.type === "export_clause");
    if (clause) {
      for (const spec of clause.namedChildren) {
        if (!spec || spec.type !== "export_specifier") continue;
        const nameNode = spec.childForFieldName("name");
        const aliasNode = spec.childForFieldName("alias");
        if (!nameNode) continue;
        exports.push({
          exportedName: aliasNode ? aliasNode.text : nameNode.text,
          localName: nameNode.text,
          source,
          isDefault: false,
          line: line(stmt),
        });
      }
    }
  }

  return exports;
}
import type { Parser, Node } from "web-tree-sitter";
import { FUNCTION_QUERY } from "./query.js";
import { loadLanguage } from "./loadLanguage.js";
import { extractImports, extractExports } from "./Extractimportsexports.js";
import type { FunctionNode, ParsedFile, SupportedLang } from "./types.js";

/** Walks up from `node` and returns true if it's inside an `export_statement`. */
function isExported(node: Node): boolean {
  let cur: Node | null = node;
  while (cur) {
    if (cur.type === "export_statement") return true;
    cur = cur.parent;
  }
  return false;
}

function isDefaultExport(node: Node): boolean {
  let cur: Node | null = node;
  while (cur) {
    if (cur.type === "export_statement") {
      // export_statement has a literal "default" token as a child when it's a default export
      return cur.children.some((c) => c?.type === "default");
    }
    cur = cur.parent;
  }
  return false;
}

/** Walks up to find the nearest enclosing class name, if any (for methods). */
function findParentClass(node: Node): string | undefined {
  let cur: Node | null = node.parent;
  while (cur) {
    if (cur.type === "class_declaration" || cur.type === "class") {
      const nameNode = cur.childForFieldName("name");
      if (nameNode) return nameNode.text;
    }
    cur = cur.parent;
  }
  return undefined;
}

/** Classifies the @func node into a human-friendly kind string. */
function classifyKind(funcNode: Node): string {
  switch (funcNode.type) {
    case "function_declaration":
      return "declaration";
    case "method_definition":
      return "method";
    case "variable_declarator": {
      const value = funcNode.childForFieldName("value");
      return value?.type === "arrow_function" ? "arrow" : "function_expression";
    }
    case "pair":
      return "object_method";
    default:
      return "unknown";
  }
}

/** Resolves the display name for a matched function, given the @name capture (if any). */
function resolveName(funcNode: Node, nameNode: Node | undefined): string {
  if (nameNode) return nameNode.text;
  return "<anonymous>";
}

export async function extractFunctionsFromSource(
  sourceCode: string,
  filePath: string,
  lang: SupportedLang,
  parser: Parser
): Promise<ParsedFile> {
  const tree = parser.parse(sourceCode);
  if (!tree) {
    throw new Error(`Failed to parse ${filePath}: parser.parse() returned null (no language set on parser?)`);
  }
  const language = await loadLanguage(lang);
  const query = language.query(FUNCTION_QUERY);

  const matches = query.matches(tree.rootNode);
  const functions: FunctionNode[] = [];
  const seenIds = new Set<string>();

  for (const match of matches) {
    const funcCapture = match.captures.find((c) => c.name === "func");
    const nameCapture = match.captures.find((c) => c.name === "name");
    if (!funcCapture) continue;

    const funcNode = funcCapture.node;
    const name = resolveName(funcNode, nameCapture?.node);
    const startLine = funcNode.startPosition.row + 1;
    const endLine = funcNode.endPosition.row + 1;

    let id = `${filePath}#${name}#L${startLine}`;
    // Guard against duplicate IDs (e.g. overloaded declarations on the same line).
    if (seenIds.has(id)) id = `${id}:${funcNode.startIndex}`;
    seenIds.add(id);

    functions.push({
      id,
      filePath,
      name,
      kind: classifyKind(funcNode),
      startLine,
      endLine,
      startIndex: funcNode.startIndex,
      endIndex: funcNode.endIndex,
      isExported: isExported(funcNode),
      isDefaultExport: isDefaultExport(funcNode),
      text: funcNode.text,
      parentClass: findParentClass(funcNode),
    });
  }

  // Sort by source position so downstream consumers get deterministic ordering.
  functions.sort((a, b) => a.startIndex - b.startIndex);

  const imports = extractImports(tree.rootNode);
  const exports = extractExports(tree.rootNode);

  return { filePath, lang, functions, imports, exports };
}
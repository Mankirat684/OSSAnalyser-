import type { Node } from "web-tree-sitter";
import { CALL_QUERY } from "./query.js";
import { loadLanguage } from "./loadLanguage.js";
import type { FunctionNode, SupportedLang } from "./types.js";

export interface CallSite {
  /** id of the FunctionNode this call occurs inside; null if it's at module top-level */
  callerId: string | null;
  /** raw identifier text being called — NOT yet resolved to a FunctionNode. Could be local, imported, or a global/external (e.g. "fetch", "console.log"). */
  calleeName: string;
  line: number;
}

/**
 * Same detection logic as classifyKind() in extractFunctions.ts — must stay in sync,
 * since this is how we recognize "this ancestor node IS one of our tracked FunctionNodes".
 */
function isTrackedFunctionNode(node: Node): boolean {
  switch (node.type) {
    case "function_declaration":
    case "method_definition":
      return true;
    case "variable_declarator":
    case "pair": {
      const value = node.childForFieldName("value");
      return value?.type === "arrow_function" || value?.type === "function_expression";
    }
    default:
      return false;
  }
}

/** Walks up from a node to the nearest enclosing tracked function, returning its FunctionNode id (or null if at module scope). */
function findEnclosingFunctionId(node: Node, idByStartIndex: Map<number, string>): string | null {
  let cur: Node | null = node.parent;
  while (cur) {
    if (isTrackedFunctionNode(cur)) {
      const id = idByStartIndex.get(cur.startIndex);
      if (id) return id;
    }
    cur = cur.parent;
  }
  return null;
}

export async function extractCalls(root: Node, lang: SupportedLang, functions: FunctionNode[]): Promise<CallSite[]> {
  // startIndex is unique per function within a file (two functions can't start at the same byte offset),
  // so it's a safe, cheap key for mapping an AST node back to the FunctionNode we already extracted.
  const idByStartIndex = new Map(functions.map((f) => [f.startIndex, f.id]));

  const language = await loadLanguage(lang);
  const query = language.query(CALL_QUERY);
  const matches = query.matches(root);

  const calls: CallSite[] = [];
  for (const match of matches) {
    const callCapture = match.captures.find((c) => c.name === "call");
    const calleeCapture = match.captures.find((c) => c.name === "callee");
    if (!callCapture || !calleeCapture) continue;

    calls.push({
      callerId: findEnclosingFunctionId(callCapture.node, idByStartIndex),
      calleeName: calleeCapture.node.text,
      line: callCapture.node.startPosition.row + 1,
    });
  }

  return calls;
}
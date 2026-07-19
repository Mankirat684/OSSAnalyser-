import type { CallEdge, FunctionNode } from "./types.js";

export interface DependencyGraph {
  /** every function in the repo — the graph's vertex set */
  nodes: Map<string, FunctionNode>;
  /** caller id -> set of callee ids. Only resolved, in-repo calls — external/unresolved never appear here. */
  adjacency: Map<string, Set<string>>;
  /**
   * Everything we couldn't resolve into the graph, kept for context (e.g. surfacing
   * "this function does I/O via fs" to the LLM) without it participating in SCC/toposort.
   */
  externalCallsByFunction: Map<string, { label: string; reason: string }[]>;
}

export function buildDependencyGraph(functions: FunctionNode[], edges: CallEdge[]): DependencyGraph {
  const nodes = new Map(functions.map((f) => [f.id, f]));
  const adjacency = new Map<string, Set<string>>();
  const externalCallsByFunction = new Map<string, { label: string; reason: string }[]>();

  for (const fn of functions) adjacency.set(fn.id, new Set());

  for (const edge of edges) {
    if (edge.to.type === "resolved") {
      // Defensive: only wire the edge if both ends are real vertices we know about.
      if (!nodes.has(edge.from) || !nodes.has(edge.to.functionId)) continue;
      adjacency.get(edge.from)!.add(edge.to.functionId);
    } else {
      const list = externalCallsByFunction.get(edge.from) ?? [];
      list.push({ label: edge.to.label, reason: edge.to.reason });
      externalCallsByFunction.set(edge.from, list);
    }
  }

  return { nodes, adjacency, externalCallsByFunction };
}
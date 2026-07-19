import type { DependencyGraph } from "./buildGraph.js";
import type { StronglyConnectedComponent } from "./tarjan.js";

export interface OrderedChunk {
  /** A single non-cyclic function is a 1-member SCC; a cyclic SCC (mutual recursion) is one atomic multi-function chunk — there's no valid ordering *within* a cycle, so its members are always chunked together. */
  scc: StronglyConnectedComponent;
}

/**
 * Produces the bottom-up chunk order: every function's callees are ordered before the
 * function itself, so when you send a caller to the LLM, its callees' chunks (and any
 * summaries you've derived from them) are already available as context.
 *
 * A *standard* topological sort of a caller->callee graph puts callers first (entry
 * points before their dependencies) — the opposite of what we want here. So: build the
 * condensation graph over SCCs, topo-sort it normally, then reverse.
 */
export function computeChunkOrder(graph: DependencyGraph, sccs: StronglyConnectedComponent[]): OrderedChunk[] {
  const sccIdByFunctionId = new Map<string, string>();
  for (const scc of sccs) {
    for (const memberId of scc.memberIds) sccIdByFunctionId.set(memberId, scc.id);
  }

  const condensationAdjacency = new Map<string, Set<string>>();
  const inDegree = new Map<string, number>();
  for (const scc of sccs) {
    condensationAdjacency.set(scc.id, new Set());
    inDegree.set(scc.id, 0);
  }

  for (const [callerId, calleeIds] of graph.adjacency) {
    const callerScc = sccIdByFunctionId.get(callerId);
    if (!callerScc) continue;
    for (const calleeId of calleeIds) {
      const calleeScc = sccIdByFunctionId.get(calleeId);
      if (!calleeScc || calleeScc === callerScc) continue; // internal SCC edge — collapsed away
      if (!condensationAdjacency.get(callerScc)!.has(calleeScc)) {
        condensationAdjacency.get(callerScc)!.add(calleeScc);
        inDegree.set(calleeScc, (inDegree.get(calleeScc) ?? 0) + 1);
      }
    }
  }

  // Kahn's algorithm. Using an index pointer instead of Array.shift() to stay O(n) on large repos.
  const queue: string[] = [];
  for (const [sccId, degree] of inDegree) if (degree === 0) queue.push(sccId);

  const topoOrder: string[] = [];
  const remainingInDegree = new Map(inDegree);
  let head = 0;
  while (head < queue.length) {
    const sccId = queue[head++]!;
    topoOrder.push(sccId);
    for (const neighborId of condensationAdjacency.get(sccId) ?? []) {
      const newDegree = remainingInDegree.get(neighborId)! - 1;
      remainingInDegree.set(neighborId, newDegree);
      if (newDegree === 0) queue.push(neighborId);
    }
  }

  if (topoOrder.length !== sccs.length) {
    // Structurally should never happen — the SCC condensation is a DAG by definition.
    // If this fires, an SCC or condensation edge was built incorrectly upstream.
    throw new Error(`Toposort covered ${topoOrder.length}/${sccs.length} SCCs — condensation graph should always be a DAG.`);
  }

  const sccById = new Map(sccs.map((s) => [s.id, s]));
  return topoOrder.reverse().map((id) => ({ scc: sccById.get(id)! }));
}
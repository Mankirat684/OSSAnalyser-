import type { DependencyGraph } from "./buildGraph.js";

export interface StronglyConnectedComponent {
  id: string;
  memberIds: string[]; // FunctionNode ids in this SCC
  /** true if this SCC represents real mutual recursion (>1 member, or a single function calling itself) */
  isCyclic: boolean;
}

/**
 * Iterative Tarjan's algorithm. Deliberately non-recursive — a recursive implementation
 * uses one JS call-stack frame per AST call depth, and real repos can have deep call
 * chains (or just enough functions) to blow the default stack (~10-15k frames on Node).
 * The work stack here replaces the call stack explicitly.
 */
export function findStronglyConnectedComponents(graph: DependencyGraph): StronglyConnectedComponent[] {
  const { nodes, adjacency } = graph;

  let indexCounter = 0;
  const index = new Map<string, number>();
  const lowlink = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const sccs: StronglyConnectedComponent[] = [];

  interface Frame {
    nodeId: string;
    neighbors: string[];
    neighborIndex: number;
  }

  for (const startId of nodes.keys()) {
    if (index.has(startId)) continue;

    const work: Frame[] = [{ nodeId: startId, neighbors: [...(adjacency.get(startId) ?? [])], neighborIndex: 0 }];
    index.set(startId, indexCounter);
    lowlink.set(startId, indexCounter);
    indexCounter++;
    stack.push(startId);
    onStack.add(startId);

    while (work.length > 0) {
      const frame = work[work.length - 1]!;
      const { nodeId } = frame;

      if (frame.neighborIndex < frame.neighbors.length) {
        const neighborId = frame.neighbors[frame.neighborIndex]!;
        frame.neighborIndex++;

        if (!index.has(neighborId)) {
          // Tree edge — "recurse" by pushing a new frame instead of calling the function.
          index.set(neighborId, indexCounter);
          lowlink.set(neighborId, indexCounter);
          indexCounter++;
          stack.push(neighborId);
          onStack.add(neighborId);
          work.push({ nodeId: neighborId, neighbors: [...(adjacency.get(neighborId) ?? [])], neighborIndex: 0 });
        } else if (onStack.has(neighborId)) {
          // Back/cross edge to a node still on the stack — update lowlink.
          lowlink.set(nodeId, Math.min(lowlink.get(nodeId)!, index.get(neighborId)!));
        }
      } else {
        // All neighbors explored — this is the point a recursive call would "return".
        work.pop();
        if (work.length > 0) {
          const parent = work[work.length - 1]!;
          lowlink.set(parent.nodeId, Math.min(lowlink.get(parent.nodeId)!, lowlink.get(nodeId)!));
        }

        if (lowlink.get(nodeId) === index.get(nodeId)) {
          const memberIds: string[] = [];
          let popped: string;
          do {
            popped = stack.pop()!;
            onStack.delete(popped);
            memberIds.push(popped);
          } while (popped !== nodeId);

          const onlyMember = memberIds[0]!;
          const isSelfLoop = memberIds.length === 1 && (adjacency.get(onlyMember) ?? new Set()).has(onlyMember);
          sccs.push({
            id: `scc:${sccs.length}`,
            memberIds,
            isCyclic: memberIds.length > 1 || isSelfLoop,
          });
        }
      }
    }
  }

  return sccs;
}
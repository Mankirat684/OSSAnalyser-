import path from "node:path";
import { parseRepo } from "./index.js";
import { resolveAllCalls } from "./crossFileResolve.js";
import { loadResolverConfig } from "./resolveModule.js";
import { buildDependencyGraph } from "./buildGraph.js";
import { findStronglyConnectedComponents } from "./tarjan.js";
import { computeChunkOrder } from "./toposort.js";
import { fileURLToPath } from "node:url";


async function runPipeline(repoRootInput: string) {
  const repoRoot = path.resolve(repoRootInput);
  console.log(`Parsing ${repoRoot} ...`);

  const files = await parseRepo(repoRoot);
  const allFunctions = files.flatMap((f) => f.functions);
  const allCalls = files.flatMap((f) => f.calls);
  console.log(`Parsed ${files.length} files, ${allFunctions.length} functions, ${allCalls.length} call sites.`);

  const config = loadResolverConfig(repoRoot);
  const edges = resolveAllCalls(files, config);
  const resolved = edges.filter((e) => e.to.type === "resolved").length;
  const external = edges.length - resolved;
  console.log(`Resolved ${resolved}/${edges.length} calls to in-repo functions (${external} external/unresolved).`);

  const graph = buildDependencyGraph(allFunctions, edges);
  const totalEdgesInGraph = [...graph.adjacency.values()].reduce((sum, set) => sum + set.size, 0);
  console.log(`Graph: ${graph.nodes.size} vertices, ${totalEdgesInGraph} edges.`);

  const sccs = findStronglyConnectedComponents(graph);
  const cyclic = sccs.filter((s) => s.isCyclic);
  console.log(`Found ${sccs.length} SCCs (${cyclic.length} cyclic — i.e. genuine mutual/self recursion).`);

  if (cyclic.length > 0) {
    console.log("\nCyclic SCCs (chunked together as one atomic unit each):");
    for (const scc of cyclic) {
      console.log(`  [${scc.id}] ${scc.memberIds.join(" <-> ")}`);
    }
  }

  const chunkOrder = computeChunkOrder(graph, sccs);
  console.log(`\nChunk order computed: ${chunkOrder.length} chunks (bottom-up — callees before callers).`);
  console.log("\nFirst 20 chunks:");
  for (const chunk of chunkOrder.slice(0, 20)) {
    const label = chunk.scc.isCyclic ? `[CYCLE: ${chunk.scc.memberIds.join(", ")}]` : chunk.scc.memberIds[0];
    console.log(`  ${label}`);
  }

  return { files, edges, graph, sccs, chunkOrder };
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);

if (isMain) {
  if (!process.argv[2]) {
    console.error("Usage: tsx runPipeline.ts <path-to-repo>");
    process.exit(1);
  }
  runPipeline(process.argv[2]).catch((err) => {
    console.error("Pipeline failed:", err);
    process.exit(1);
  });
}

export { runPipeline };
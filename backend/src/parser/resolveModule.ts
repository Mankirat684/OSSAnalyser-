import fs from "node:fs";
import path from "node:path";

export interface ResolverConfig {
  /** absolute path to the cloned repo's root on disk */
  repoRoot: string;
  /** tsconfig compilerOptions.baseUrl, relative to repoRoot */
  baseUrl?: string;
  /** tsconfig compilerOptions.paths, e.g. { "@/*": ["src/*"] } */
  paths?: Record<string, string[]>;
}

export type ResolvedModule =
  | { type: "relative"; resolvedPath: string } // repo-relative, forward-slashed — matches ParsedFile.filePath format
  | { type: "external"; packageName: string } // npm package or Node builtin
  | { type: "unresolved"; reason: string }; // looked like a repo file but nothing on disk matched

const CODE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];
const INDEX_FILES = CODE_EXTENSIONS.map((ext) => "index" + ext);

function toRepoRelative(absolutePath: string, repoRoot: string): string {
  return path.relative(repoRoot, absolutePath).split(path.sep).join("/");
}

/** Tries: exact file, base+extension, base/index+extension — same order Node/TS resolution uses. */
function tryCandidates(absoluteBase: string, repoRoot: string): string | null {
  if (fs.existsSync(absoluteBase) && fs.statSync(absoluteBase).isFile()) {
    return toRepoRelative(absoluteBase, repoRoot);
  }
  for (const ext of CODE_EXTENSIONS) {
    const candidate = absoluteBase + ext;
    if (fs.existsSync(candidate)) return toRepoRelative(candidate, repoRoot);
  }
  for (const indexFile of INDEX_FILES) {
    const candidate = path.join(absoluteBase, indexFile);
    if (fs.existsSync(candidate)) return toRepoRelative(candidate, repoRoot);
  }
  return null;
}

/** Matches a bare specifier against tsconfig-style path aliases (supports one `*` wildcard per pattern, same as tsc). */
function matchAlias(source: string, config: ResolverConfig): string | null {
  if (!config.paths) return null;
  for (const [pattern, targets] of Object.entries(config.paths)) {
    const target = targets[0];
    if (!target) continue;
    const starIndex = pattern.indexOf("*");
    if (starIndex === -1) {
      if (pattern === source) return target.replace("*", "");
      continue;
    }
    const prefix = pattern.slice(0, starIndex);
    const suffix = pattern.slice(starIndex + 1);
    if (source.startsWith(prefix) && source.endsWith(suffix)) {
      const matched = source.slice(prefix.length, source.length - suffix.length);
      return target.replace("*", matched);
    }
  }
  return null;
}

export function resolveModule(fromFilePath: string, source: string, config: ResolverConfig): ResolvedModule {
  const fromDir = path.dirname(path.resolve(config.repoRoot, fromFilePath));

  // Relative import: './foo', '../utils/bar'
  if (source.startsWith(".")) {
    const absoluteBase = path.resolve(fromDir, source);
    const resolved = tryCandidates(absoluteBase, config.repoRoot);
    if (resolved) return { type: "relative", resolvedPath: resolved };
    return { type: "unresolved", reason: `no file on disk matches "${source}" from ${fromFilePath}` };
  }

  // Bare specifier — check tsconfig path aliases first (e.g. "@/utils/foo").
  const aliasTarget = matchAlias(source, config);
  if (aliasTarget) {
    const base = config.baseUrl ? path.resolve(config.repoRoot, config.baseUrl) : config.repoRoot;
    const resolved = tryCandidates(path.resolve(base, aliasTarget), config.repoRoot);
    if (resolved) return { type: "relative", resolvedPath: resolved };
    return { type: "unresolved", reason: `alias "${source}" matched a tsconfig path but no file was found` };
  }

  // No alias — try resolving against baseUrl directly (tsconfig allows bare imports off baseUrl even without an explicit path entry).
  if (config.baseUrl) {
    const resolved = tryCandidates(path.resolve(config.repoRoot, config.baseUrl, source), config.repoRoot);
    if (resolved) return { type: "relative", resolvedPath: resolved };
  }
  // Nothing matched inside the repo — treat as an external package (npm dep or Node builtin).
  const packageName = source.startsWith("@") ? source.split("/").slice(0, 2).join("/") : source.split("/")[0];
  if (!packageName) {
    return {
      type: "unresolved",
      reason: "couldn't get Package Name",
    };
  }
  return { type: "external", packageName };
}

/**
 * Loads compilerOptions.baseUrl/paths from tsconfig.json, if present.
 * Known limitation: does not follow `extends` chains (common in monorepos with a
 * shared base tsconfig) — if the repo relies on that, baseUrl/paths from the base
 * config won't be picked up. Worth extending if you hit this on real repos.
 */
export function loadResolverConfig(repoRoot: string): ResolverConfig {
  const tsconfigPath = path.join(repoRoot, "tsconfig.json");
  if (!fs.existsSync(tsconfigPath)) return { repoRoot };

  try {
    const raw = fs.readFileSync(tsconfigPath, "utf8");
    // tsconfig.json commonly has comments and trailing commas (JSONC) — strip naively.
    const stripped = raw
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1")
      .replace(/,(\s*[}\]])/g, "$1");
    const parsed = JSON.parse(stripped);
    const co = parsed.compilerOptions ?? {};
    return { repoRoot, baseUrl: co.baseUrl, paths: co.paths };
  } catch {
    // Malformed tsconfig shouldn't take down the whole pipeline — fall back to no aliases.
    return { repoRoot };
  }
}
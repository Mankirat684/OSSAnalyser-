import fs from "node:fs/promises";
import path from "node:path";
import { initParser, createParserFor, langForFile } from "./loadLanguage.js";
import { extractFunctionsFromSource } from "./extractFunctions.js";
import { resolveAllCalls } from "./crossFileResolve.js";
import { loadResolverConfig } from "./resolveModule.js";
import type { ParsedFile, SupportedLang } from "./types.js";
import { fileURLToPath } from "node:url";

const IGNORE_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", "coverage"]);

async function walk(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (IGNORE_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(full)));
    } else if (langForFile(full)) {
      files.push(full);
    }
  }
  return files;
}

export async function parseRepo(repoRoot: string): Promise<ParsedFile[]> {
  await initParser();

  const files = await walk(repoRoot);
  // Cache one Parser instance per language — creating a Parser per file is wasteful.
  const parserCache = new Map<SupportedLang, Awaited<ReturnType<typeof createParserFor>>>();

  const results: ParsedFile[] = [];
  for (const file of files) {
    const lang = langForFile(file);
    if (!lang) continue;

    if (!parserCache.has(lang)) {
      parserCache.set(lang, await createParserFor(lang));
    }
    const parser = parserCache.get(lang)!;

    const source = await fs.readFile(file, "utf8");
    const relativePath = path.relative(repoRoot, file).split(path.sep).join("/");

    try {
      const parsed = await extractFunctionsFromSource(source, relativePath, lang, parser);
      results.push(parsed);
    } catch (err) {
      console.error(`Failed to parse ${relativePath}:`, err);
    }
  }
  
  return results;
}

// Example standalone run: `tsx index.ts /path/to/cloned/repo`
const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const repoRoot = process.argv[2];
  if (!repoRoot) {
    console.error("Usage: tsx index.ts <path-to-repo>");
    process.exit(1);
  }
  parseRepo(repoRoot).then((results) => {
    for (const file of results) {
      if (file.functions.length === 0 && file.imports.length === 0 && file.exports.length === 0) continue;
      console.log(`\n${file.filePath}`);
      for (const fn of file.functions) {
        console.log(
          `  [${fn.kind}] ${fn.name} (L${fn.startLine}-${fn.endLine})${fn.isExported ? " [exported]" : ""}${
            fn.parentClass ? ` (class ${fn.parentClass})` : ""
          }`
        );
      }
      for (const imp of file.imports) {
        console.log(`  import ${imp.kind} ${imp.importedName ?? ""} as ${imp.localName ?? ""} from "${imp.source}"`);
      }
      for (const exp of file.exports) {
        console.log(
          `  export ${exp.exportedName}${exp.source ? ` (re-export from "${exp.source}")` : ""}`
        );
      }
    }

    console.log("\n--- resolved call edges ---");
    const config = loadResolverConfig(repoRoot);
    const edges = resolveAllCalls(results, config);
    const resolvedCount = edges.filter((e) => e.to.type === "resolved").length;
    console.log(`${edges.length} total call edges, ${resolvedCount} resolved to a specific function\n`);
    for (const edge of edges) {
      const target = edge.to.type === "resolved" ? edge.to.functionId : `[external: ${edge.to.label} — ${edge.to.reason}]`;
      console.log(`  ${edge.from} -> ${target}`);
    }
  });
}
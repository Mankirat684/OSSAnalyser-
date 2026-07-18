import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initParser, createParserFor, langForFile } from "./loadLanguage.js";
import { extractFunctionsFromSource } from "./extractFunctions.js";
import type { ParsedFile, SupportedLang } from "./types.js";
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
    const relativePath = path.relative(repoRoot, file);
 
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
      if (file.functions.length === 0) continue;
      console.log(`\n${file.filePath}`);
      for (const fn of file.functions) {
        console.log(
          `  [${fn.kind}] ${fn.name} (L${fn.startLine}-${fn.endLine})${fn.isExported ? " [exported]" : ""}${
            fn.parentClass ? ` (class ${fn.parentClass})` : ""
          }`
        );
      }
    }
  });
} 
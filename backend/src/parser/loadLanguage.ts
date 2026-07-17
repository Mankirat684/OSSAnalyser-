import Parser,{Language} from 'web-tree-sitter';
import path from "node:path";
import type{SupportedLang} from './types.js'

const WASM_DIR = path.resolve(process.cwd(), "wasm");
 
const GRAMMAR_FILES: Record<SupportedLang, string> = {
  javascript: "tree-sitter-javascript.wasm",
  typescript: "tree-sitter-typescript.wasm",
  tsx: "tree-sitter-tsx.wasm",
};
 
let initialized = false;
const languageCache = new Map<SupportedLang, Language>();
 
/** Call once at process startup before parsing anything. */
export async function initParser(): Promise<void> {
  if (initialized) return;
  await Parser.init();
  initialized = true;
}
 
export async function loadLanguage(lang: SupportedLang): Promise<Language> {
  if (!initialized) {
    throw new Error("initParser() must be called before loadLanguage()");
  }
  const cached = languageCache.get(lang);
  if (cached) return cached;
 
  const wasmPath = path.join(WASM_DIR, GRAMMAR_FILES[lang]);
  const language = await Language.load(wasmPath);
  languageCache.set(lang, language);
  return language;
}
 
/** Picks a language based on file extension. Returns null for unsupported files. */
export function langForFile(filePath: string): SupportedLang | null {
  if (filePath.endsWith(".tsx")) return "tsx";
  if (filePath.endsWith(".ts") || filePath.endsWith(".mts") || filePath.endsWith(".cts")) return "typescript";
  if (
    filePath.endsWith(".js") ||
    filePath.endsWith(".jsx") ||
    filePath.endsWith(".mjs") ||
    filePath.endsWith(".cjs")
  ) {
    return "javascript";
  }
  return null;
}
 
export async function createParserFor(lang: SupportedLang): Promise<Parser> {
  const language = await loadLanguage(lang);
  const parser = new Parser();
  parser.setLanguage(language);
  return parser;
}
 

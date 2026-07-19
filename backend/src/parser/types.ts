import type { CallSite } from "./extractCalls.js";

export type SupportedLang = "javascript" | "typescript" | "tsx";

export interface FunctionNode {
  /** Stable, unique ID: "<relativeFilePath>#<name>#L<startLine>" */
  id: string;
  filePath: string;
  name: string;
  /** "declaration" | "arrow" | "function_expression" | "method" | "anonymous" */
  kind: string;
  startLine: number;
  endLine: number;
  startIndex: number;
  endIndex: number;
  isExported: boolean;
  /** true if this function is the default export */
  isDefaultExport: boolean;
  /** raw source text of the function body, useful later for LLM chunking */
  text: string;
  /** enclosing class name, if this is a method */
  parentClass?: string | undefined;
}

/**
 * One binding introduced by an `import` statement.
 * "source" is the raw module specifier as written — NOT yet resolved to a file path.
 * e.g. `import { foo as bar } from '../utils/helpers'`
 *      -> { source: '../utils/helpers', kind: 'named', importedName: 'foo', localName: 'bar' }
 */
export interface ImportBinding {
  source: string;
  kind: "default" | "named" | "namespace" | "side-effect";
  /** the name as exported by the source module ("default", "*", or the real name). null for side-effect imports. */
  importedName: string | null;
  /** the name this file refers to it as, after any alias. null for side-effect imports. */
  localName: string | null;
  /** line number of the import statement, for debugging/diagnostics */
  line: number;
}

/**
 * One binding introduced or re-exported by an `export` statement.
 * "source" is set only for re-exports (`export { x } from './y'`); null for local exports.
 */
export interface ExportBinding {
  /** the name visible to importers ("default", "*", or the real name) */
  exportedName: string;
  /** the name of the local declaration being exported. null for `export * from`. */
  localName: string | null;
  /** set only for re-exports */
  source: string | null;
  isDefault: boolean;
  line: number;
}

/**
 * Why a call couldn't be resolved to a specific FunctionNode.
 * Kept as a reason rather than just dropping the edge, so you retain visibility
 * into external dependencies (npm calls) and genuinely ambiguous method calls.
 */
export type ExternalReason =
  | "npm-package" // resolved to an external package, e.g. lodash, react
  | "unresolved-import" // looked like a repo file but nothing on disk matched
  | "unresolved-export" // target file resolved, but it doesn't export that name
  | "unresolved-identifier" // not declared or imported anywhere in the caller's file (global/builtin, or truly undefined)
  | "method-heuristic"; // obj.foo() where obj isn't a traceable namespace import — needs real type info to resolve

export type EdgeTarget =
  | { type: "resolved"; functionId: string }
  | { type: "external"; label: string; reason: ExternalReason };

export interface CallEdge {
  from: string; // FunctionNode.id of the caller
  to: EdgeTarget;
  line: number;
}

export interface ParsedFile {
  filePath: string;
  lang: SupportedLang;
  functions: FunctionNode[];
  imports: ImportBinding[];
  exports: ExportBinding[];
  calls: CallSite[];
}
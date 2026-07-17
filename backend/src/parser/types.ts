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
  parentClass?: string;
}

export interface ParsedFile {
  filePath: string;
  lang: SupportedLang;
  functions: FunctionNode[];
}
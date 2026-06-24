export type ProjectType =
  | "swift"
  | "node"
  | "go"
  | "rust"
  | "python"
  | "java"
  | "cpp"
  | "generic";

export interface ProjectProfile {
  extensions: string[];
  skipDirs: string[];
  defaultSourceDirs: string[];
  languageHint: string;
}

export type Marker =
  | "EXPLICIT"
  | "INFERRED:strong"
  | "INFERRED:weak"
  | "INFERRED"
  | "ASSUMED"
  | "MISSING_INFO";

export type KnowledgeLayer = "canonical" | "derived" | "meta" | "skill";

export type SourceTier = "T1" | "T2" | "T3" | "T4";

export interface KnowledgeMeta {
  module: string;
  updated: string;
  files: string[];
  layer?: KnowledgeLayer;
  tier?: SourceTier;
}

export interface KnowledgeFinding {
  file: string; // path relative to .knowledge/
  severity: "BLOCK" | "FLAG";
  code: string; // KG1..KG6 or a structural code
  message: string;
}

export interface KnowledgeVerifyReport {
  pass: boolean; // true when no BLOCK findings
  filesChecked: number;
  findings: KnowledgeFinding[];
}

export interface KnowledgeFile extends KnowledgeMeta {
  content: string; // markdown body after frontmatter stripped
  path: string; // absolute filesystem path
}

export interface SearchResult {
  module: string;
  section: string;
  text: string;
  score: number; // lexical relevance, bounded ~[0, 1]
}

export type ErrorCode =
  | "CONFIG_NOT_FOUND"
  | "KNOWLEDGE_DIR_NOT_FOUND"
  | "MODULE_NOT_FOUND"
  | "INVALID_INPUT";

export class KnowledgeError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "KnowledgeError";
  }
}

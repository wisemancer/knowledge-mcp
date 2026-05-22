import { z } from 'zod';

export const ConfigSchema = z.object({
  ollama_host: z.string().default('http://localhost:11434'),
  ollama_model: z.string().default('qwen2.5-coder:7b'),
  embed_model: z.string().default('nomic-embed-text'),
  anthropic_api_key: z.string().optional(),
  claude_model: z.string().default('claude-sonnet-4-6'),
});
export type Config = z.infer<typeof ConfigSchema>;

export interface KnowledgeMeta {
  module: string;
  updated: string;
  files: string[];
}

export interface KnowledgeFile extends KnowledgeMeta {
  content: string;
  path: string;
}

export interface VectorEntry {
  id: string;
  module: string;
  section: string;
  text: string;
  embedding: number[];
}

export interface VectorIndex {
  version: 1;
  entries: VectorEntry[];
}

export interface SearchResult {
  module: string;
  section: string;
  text: string;
  score: number;
}

export type ErrorCode =
  | 'CONFIG_NOT_FOUND'
  | 'KNOWLEDGE_DIR_NOT_FOUND'
  | 'MODULE_NOT_FOUND'
  | 'OLLAMA_UNAVAILABLE'
  | 'CLAUDE_UNAVAILABLE'
  | 'EMBED_FAILED'
  | 'INVALID_INPUT';

export class KnowledgeError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'KnowledgeError';
  }
}

---
module: search
updated: 2026-04-28
files: [src/search/engine.ts]
---

## Purpose
Semantic search across the knowledge base. Chunks each knowledge file into sections (split by `## ` headings), generates embeddings via Ollama, stores them in the JSON vector index, and returns top-N results by cosine similarity.

## Decisions
- **Section-level chunking at `## ` boundaries**: Sections are semantically coherent and small enough for accurate embedding. Splitting at heading boundaries avoids mixing unrelated content in one chunk.
- **Lazy index rebuild on staleness**: On each search, compare `.index.json` mtime against all `.md` file mtimes. If any `.md` is newer, rebuild before searching. First-time search with no index also triggers rebuild.
- **In-process cosine similarity**: At knowledge-base scale (dozens to ~200 sections), linear scan over all vectors in JS is fast (<10ms). No ANN library needed.

## Patterns
```typescript
// Search triggers lazy rebuild if index is stale
const results = await searchKnowledge(projectDir, 'how to handle errors', 5, config);

// Force a rebuild explicitly (e.g., after generate_knowledge_base)
await rebuildIndex(projectDir, config);
```

## Constraints
- If Ollama is unreachable, throw `KnowledgeError('OLLAMA_UNAVAILABLE', ...)`. Never return empty results silently.
- Strip markdown formatting (code fences, backticks, `#*_~>` chars) from section text before embedding. Store stripped text in the index.
- Index rebuild writes to `.index.json.tmp` then atomically renames to `.index.json`.
- Sections shorter than 20 characters after stripping are skipped.

## Interfaces
```typescript
export function cosineSimilarity(a: number[], b: number[]): number

export async function rebuildIndex(projectDir: string, config: Config): Promise<void>

export async function searchKnowledge(
  projectDir: string,
  query: string,
  topK: number,
  config: Config
): Promise<SearchResult[]>

// SearchResult (from src/types.ts):
// { module: string; section: string; text: string; score: number }
```

## Files
- `src/search/engine.ts` — `searchKnowledge`, `rebuildIndex`, `cosineSimilarity`, staleness check, markdown stripper, section chunker

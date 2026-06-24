---
module: search
updated: 2026-06-24
files: [src/search/engine.ts]
---

## Purpose
Dependency-free lexical search across the knowledge base. Chunks each knowledge file into sections (split by `## ` headings), strips markdown, and scores each section against the query by term coverage, term-frequency density, and a heading-match boost. No embeddings, no external model. See `decisions/008-standalone-mcp`.

## Decisions
- **Lexical, not semantic**: At knowledge-base scale (dozens to ~200 sections) in-process term scoring returns useful results in well under 10ms with zero dependencies. Removed the Ollama embedding model and the JSON vector index.
- **Section-level chunking at `## ` boundaries**: Sections are coherent units; splitting at headings avoids mixing unrelated content in one result.
- **Coverage-led scoring**: `score = coverage*0.7 + min(0.2, tfDensity) + headingBoost`, bounded ~[0,1]. Coverage (fraction of query terms present) dominates; density and heading hits break ties.

## Patterns
```typescript
const results = await searchKnowledge(projectDir, 'how to handle errors', 5);
```

## Constraints
- Always strip markdown (code fences, backticks, `#*_~>|`) from section text before scoring.
- Never require a network service or model — search must work offline with no config.
- Drop query stopwords and 1-character tokens; sections under 20 chars after stripping are skipped.
- Sections with zero matched query terms are excluded from results.

## Interfaces
```typescript
export async function searchKnowledge(
  projectDir: string,
  query: string,
  topK: number
): Promise<SearchResult[]>

// SearchResult (from src/types.ts):
// { module: string; section: string; text: string; score: number }
```

## Files
- `src/search/engine.ts` — `searchKnowledge`, lexical scorer, markdown stripper, section chunker, tokenizer

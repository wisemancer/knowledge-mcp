---
module: decisions/001-json-vector-store
updated: 2026-04-28
files: [src/search/vector-store.ts]
---

## Decision
Use a plain JSON file (`.knowledge/.index.json`) as the vector store for semantic search indexing.

## Status
Accepted

## Context
Semantic search requires storing embedding vectors and querying them by similarity. Options evaluated:
- **chromadb** — well-featured, but requires a running server or SQLite native bindings
- **sqlite-vss** — native binary module, platform-specific build issues
- **hnswlib-node** — native binary, ANN search, overkill for this scale
- **Plain JSON + in-memory cosine** — zero dependencies, works anywhere Node runs

## Rationale
Knowledge bases are small by design (dozens to ~200 sections at most). Linear cosine scan over all vectors in JS takes <10ms at this scale. A plain JSON file requires no additional dependencies, is human-readable, inspectable with `cat`, and travels with the project in git.

## Upgrade Path
If a project's knowledge base grows beyond ~1,000 sections (e.g., a large monorepo), replace `src/search/vector-store.ts` with a chromadb implementation behind the same `loadIndex` / `saveIndex` / `upsertEntries` interface. The search engine (`engine.ts`) and all callers require no changes.

## Consequences
- Zero extra dependencies or native binaries.
- Index is human-readable and version-controllable.
- Linear scan is unsuitable past ~1,000 entries — but that's well beyond the expected use case.
- Full index rebuild required after any knowledge update (acceptable for batch usage).

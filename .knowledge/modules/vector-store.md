---
module: vector-store
updated: 2026-04-28
files: [src/search/vector-store.ts]
---

## Purpose
Persists and retrieves the vector index as `.knowledge/.index.json`. Provides CRUD operations for vector entries. Acts as the storage layer beneath the search engine — the search engine calls these functions; nothing else does.

## Decisions
- **Plain JSON, no compression**: Inspectable with any text editor, zero dependencies. At knowledge-base scale, JSON serialization overhead is negligible.
- **Version field = 1**: `VectorIndex.version` enables future schema migrations without breaking existing reads.
- **Deterministic entry IDs**: `id = "${module}::${sectionHeading}"`. Deterministic IDs enable `upsertEntries` to overwrite stale entries by key.
- **`upsertEntries` is pure**: Takes an index and new entries, returns a new index. Does not write to disk. Callers call `saveIndex` afterward.

## Patterns
```typescript
const index = await loadIndex(projectDir);
const updated = upsertEntries(index, newEntries);
await saveIndex(projectDir, updated);
```

## Constraints
- Index path is always `<projectDir>/.knowledge/.index.json`. Never configurable.
- `loadIndex` returns `{ version: 1, entries: [] }` if file does not exist — never throws.
- `saveIndex` is the only place that writes `.index.json`. Do not write the file anywhere else.
- Do not store full markdown in entries — only store stripped plain text.

## Interfaces
```typescript
// In src/types.ts:
export interface VectorEntry {
  id: string;         // "${module}::${sectionHeading}"
  module: string;
  section: string;
  text: string;       // stripped plain text (no markdown syntax)
  embedding: number[];
}

export interface VectorIndex {
  version: 1;
  entries: VectorEntry[];
}

// In src/search/vector-store.ts:
export async function loadIndex(projectDir: string): Promise<VectorIndex>
export async function saveIndex(projectDir: string, index: VectorIndex): Promise<void>
export function upsertEntries(index: VectorIndex, entries: VectorEntry[]): VectorIndex
```

## Files
- `src/search/vector-store.ts` — `loadIndex`, `saveIndex`, `upsertEntries`, index path helper

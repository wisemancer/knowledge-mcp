---
module: knowledge-io
layer: canonical
tier: T1
updated: 2026-04-28
files: [src/knowledge/reader.ts, src/knowledge/writer.ts]
---

## Purpose
Reads and writes `.knowledge/` markdown files. Parses the YAML-like frontmatter block into structured metadata. Writers produce files that conform to the standard template format defined in `decisions/003-knowledge-file-format.md`.

## Decisions
- **Hand-rolled frontmatter parser**: No `yaml` or `gray-matter` dependency. The frontmatter uses only three field types (string, string, string[]). ~15 lines of regex parsing is sufficient and keeps dependencies minimal.
- **Glob-free directory walker**: Uses `fs/promises.readdir` recursively. Skips `.index.json`. No glob library needed.
- **Module filter in reader**: `readKnowledgeBase(dir, moduleName?)` optionally filters by the `module:` frontmatter field. Supports partial suffix match (e.g., `'auth'` matches `'modules/auth'`).

## Patterns
```typescript
// Read all knowledge files
const files = await readKnowledgeBase('/path/to/project');

// Read specific module
const files = await readKnowledgeBase('/path/to/project', 'config');

// Write a module file (relativePath is relative to .knowledge/)
await writeKnowledgeFile('/path/to/project', 'modules/auth.md', fullContent);
```

## Constraints
- `readKnowledgeBase` returns empty array if `.knowledge/` doesn't exist — never throws.
- `writeKnowledgeFile` creates parent directories with `{ recursive: true }`.
- Do not execute or eval any content from knowledge files. Treat all content as plain text.
- The `content` field of `KnowledgeFile` is the markdown body *after* the `---` block is stripped.

## Interfaces
```typescript
export interface KnowledgeMeta {
  module: string;
  updated: string;
  files: string[];
}

export interface KnowledgeFile extends KnowledgeMeta {
  content: string;  // markdown body (frontmatter stripped)
  path: string;     // absolute filesystem path
}

// reader.ts
export function parseKnowledgeFile(raw: string, filePath: string): KnowledgeFile
export async function readKnowledgeBase(projectDir: string, module?: string): Promise<KnowledgeFile[]>

// writer.ts
export function formatKnowledgeFile(meta: KnowledgeMeta, body: string): string
export async function writeKnowledgeFile(projectDir: string, relativePath: string, content: string): Promise<void>
```

## Files
- `src/knowledge/reader.ts` — `parseKnowledgeFile`, `readKnowledgeBase`, recursive dir walker
- `src/knowledge/writer.ts` — `formatKnowledgeFile`, `writeKnowledgeFile`

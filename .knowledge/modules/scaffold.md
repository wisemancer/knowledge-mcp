---
module: scaffold
updated: 2026-05-04
files: [src/scaffold/index.ts]
---

## Purpose
Implements `init_knowledge_base` (scaffold empty template files) and `generate_knowledge_base` (read source code, call Claude, write full knowledge base). These are the bootstrapping operations — run once per project.

## Decisions
- **Templates as inline literals**: The empty templates for `init` are template literal strings in `scaffold/index.ts`. No external template files to ship with the package.
- **`init` is idempotent**: Checks file existence before writing. Skips files that already exist. Safe to call multiple times.
- **`generate` requires Claude**: Throws `KnowledgeError('CLAUDE_UNAVAILABLE')` if no API key configured. Falls back to a stub message is the wrong design — fail loudly.
- **Source discovery skips noise dirs**: Skips `node_modules`, `.git`, `dist`, `build`, `__pycache__`, `.venv`. Supports `.ts`, `.js`, `.py`, `.go`, `.rs`, `.java`, `.cpp`, `.c`.
- **100KB source cap per generation call**: Prevents context overflow. Collects files until total character count exceeds 100,000, then stops.

## Patterns
```typescript
await initKnowledgeBase(projectDir, 'my-project');     // scaffolds templates
await generateKnowledgeBase(projectDir, config, ['src/']); // calls Claude, writes docs
```

## Constraints
- `initKnowledgeBase` must not overwrite existing files.
- `generateKnowledgeBase` may overwrite existing knowledge files (it's a full regeneration).
- After `generateKnowledgeBase`, call `rebuildIndex(projectDir, config)` to populate the vector index.
- Claude response parsing: extract `=== filename ===\n<content>\n=== end ===` blocks. Skip malformed blocks silently.
- `relativePath` passed to `writeKnowledgeFile` must not start with `.knowledge/` — that prefix is added by the writer.
- If a source directory passed to `generateKnowledgeBase` does not exist, the internal `walkDir` returns an empty list for that path silently. It does not throw.

## Interfaces
```typescript
export async function initKnowledgeBase(projectDir: string, projectName?: string): Promise<void>
export async function generateKnowledgeBase(projectDir: string, config: Config, sourceDirs: string[]): Promise<void>
```

## Files
- `src/scaffold/index.ts` — `initKnowledgeBase`, `generateKnowledgeBase`, inline templates, private `walkDir`

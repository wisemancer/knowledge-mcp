---
module: scaffold
updated: 2026-05-04
files: [src/scaffold/index.ts]
---

## Purpose
Implements `init_knowledge_base` (scaffold empty template files including `AGENTS.md`) and `generate_knowledge_base` (read source code and generate text content). These are the bootstrapping operations — run once per project.

## Decisions
- **Templates as inline literals**: The empty templates for `init` are template literal strings in `scaffold/index.ts`. No external template files to ship with the package.
- **`init` is idempotent**: Checks file existence before writing. Skips files that already exist. Safe to call multiple times.
- **`AGENTS.md` written by `init`, not `generate`**: AGENTS.md is structural scaffolding (same shape for every project, just parameterized by name). `generate` is for knowledge derived from source code. See `decisions/005-agents-md.md`.
- `generate` requires no API key: The generation function now collects source file text and returns it, allowing the caller to perform reasoning and generation using its own context (e.g., another local LLM).
- **Source discovery skips noise dirs**: Skips `node_modules`, `.git`, `dist`, `build`, `__pycache__`, `.venv`. Supports `.ts`, `.js`, `.py`, `.go`, `.rs`, `.java`, `.cpp`, `.c`.
- **100KB source cap per generation call**: Prevents context overflow. Collects files until total character count exceeds 100,000, then stops.

## Patterns
```typescript
await initKnowledgeBase(projectDir, 'my-project');     // scaffolds templates
// Generate the knowledge base content text
const sourceText = await generateKnowledgeBase(projectDir, ['src/']); 
// Call the tool to write the documents based on the collected text
// (The agent should reason over the sourceText and call write_knowledge_file)
```

## Constraints
- `initKnowledgeBase` must not overwrite existing files — including `AGENTS.md`.
- `AGENTS.md` is written to `projectDir` directly (project root), not inside `.knowledge/`. Use `writeFile` directly, not `writeKnowledgeFile`.
- `generate_knowledge_base` may overwrite existing knowledge files (it's a full regeneration). It does not touch `AGENTS.md`.
- After `generate_knowledge_base` (and the subsequent `write_knowledge_file` calls), call `rebuildIndex(projectDir, config)` to populate the vector index.
- Claude response parsing: extract `=== filename ===\n<content>\n=== end ===` blocks. Skip malformed blocks silently.
- `relativePath` passed to `writeKnowledgeFile` must not start with `.knowledge/` — that prefix is added by the writer.
- If a source directory passed to `generateKnowledgeBase` does not exist, the internal `walkDir` returns an empty list for that path silently. It does not throw.

## Interfaces
```typescript
export async function initKnowledgeBase(projectDir: string, projectName?: string): Promise<void>
export async function generateKnowledgeBase(projectDir: string, sourceDirs: string[]): Promise<string>
export function designProject(idea: string): string
```

The `initKnowledgeBase` file list (all subject to existence check before write):
```
AGENTS.md                    → TEMPLATE_AGENTS_MD(projectName ?? 'project')  [project root]
.knowledge/architecture.md   → TEMPLATE_ARCHITECTURE(projectName ?? 'project')
.knowledge/conventions.md    → TEMPLATE_CONVENTIONS()
.knowledge/modules/example.md          → TEMPLATE_MODULE('example')
.knowledge/decisions/001-example.md    → TEMPLATE_DECISION('001-example')
.knowledge/skills/planning.md          → TEMPLATE_SKILL('planning')
.knowledge/skills/coding.md            → TEMPLATE_SKILL('coding')
.knowledge/skills/updater.md           → TEMPLATE_SKILL('updater')
```

## Files
- `src/scaffold/index.ts` — `initKnowledgeBase`, `generateKnowledgeBase`, `designProject`, inline templates including `TEMPLATE_AGENTS_MD`, private `walkDir`

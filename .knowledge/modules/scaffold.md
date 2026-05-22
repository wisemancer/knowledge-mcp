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
- **Project-type-aware generation**: `detectProjectType` inspects the project root for marker files (Package.swift, go.mod, Cargo.toml, package.json, etc.) and selects a language-specific profile. Detection is root-only — no recursive filesystem traversal.
- **Language-specific profiles**: 8 predefined profiles (Swift, Node, Go, Rust, Python, Java, C/C++, Generic) define extensions, skip directories, and ecosystem hints. Profiles are injected into generation prompts.
- **Source discovery respects profiles**: File collection now uses the selected profile's extension list and skip directory set instead of hardcoded values. Same 100KB cap applies.
- **100KB source cap per generation call**: Prevents context overflow. Collects files until total character count exceeds 100,000, then stops.

## Patterns
```typescript
await initKnowledgeBase(projectDir, 'my-project');     // scaffolds templates
// Detect type and generate with appropriate profile
const sourceText = await generateKnowledgeBase(projectDir, ['src/']); 
// Or override type manually
const sourceText = await generateKnowledgeBase(projectDir, ['src/'], config, 'swift');
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
export type ProjectType = 'swift' | 'node' | 'go' | 'rust' | 'python' | 'java' | 'cpp' | 'generic'

export interface ProjectProfile {
  extensions: string[];
  skipDirs: string[];
  defaultSourceDirs: string[];
  languageHint: string;
}

export async function detectProjectType(projectDir: string): Promise<ProjectType>
export async function initKnowledgeBase(projectDir: string, projectName?: string): Promise<void>
export async function generateKnowledgeBase(projectDir: string, sourceDirs: string[], config?: Config, languageOverride?: ProjectType): Promise<string>
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
- `src/scaffold/index.ts` — `detectProjectType`, `PROJECT_PROFILES` map, `initKnowledgeBase`, `generateKnowledgeBase`, `designProject`, inline templates including `TEMPLATE_AGENTS_MD`, private `walkDir`

---
module: scaffold
layer: canonical
tier: T1
updated: 2026-06-24
files: ["src/scaffold/index.ts"]
---

## Purpose
Implements `init_knowledge_base` (scaffold standard template files including `AGENTS.md`, the canonical/derived/meta layout, and the marker/tier/guardrail meta files) and `generate_knowledge_base` (read source code and return it as text with instructions that demand the standard). These are the bootstrapping operations — run once per project. The emitted shape follows `modules/knowledge-standard` and `decisions/007-kb-standard`.

## Decisions
- **Templates as inline literals**: empty templates are template-literal strings in `scaffold/index.ts`. No external template files shipped with the package.
- **`init` is idempotent**: checks file existence before writing; skips existing files; safe to call repeatedly.
- **`init` scaffolds the standard layout**: `canonical/`, `derived/`, `meta/SOURCE_TIERS.md`, `meta/GUARDRAILS.md`, plus `skills/` and root `AGENTS.md`. The two meta files ship the tier table and the KG1–KG6 catalogue so generated agents have the legend in-repo.
- **`generate_knowledge_base` instruction text demands the standard**: the returned text instructs the caller to (a) split facts into `canonical/` and analysis into `derived/`, (b) mark every claim, (c) cite every `[EXPLICIT]` with `path`/`path:line`, (d) respect tier ceilings, (e) self-review against guardrails, then (f) run `verify_knowledge`.
- **`design_project` carries the standard into greenfield**: its returned interview document frames observability, tech stack, constraints, and error handling in marker terms and points at the canonical/derived split.
- **`generate` requires no API key**: collects source text and returns it; the caller reasons and writes via `write_knowledge_file`.
- **Source discovery skips noise dirs**: skips `node_modules`, `.git`, `dist`, `build`, `__pycache__`, `.venv`. Supports `.ts`, `.js`, `.py`, `.go`, `.rs`, `.java`, `.cpp`, `.c`.
- **100KB source cap per generation call**: collects files until total character count exceeds 100,000, then stops.

## Patterns
```typescript
await initKnowledgeBase(projectDir, 'my-project');       // scaffolds the standard layout
const sourceText = await generateKnowledgeBase(projectDir, ['src/']);
// The agent reasons over sourceText, writes canonical/* then derived/* via
// write_knowledge_file (markers + citations), then calls verify_knowledge.
```

## Constraints
- `initKnowledgeBase` must not overwrite existing files — including `AGENTS.md` and the meta files.
- `AGENTS.md` is written to `projectDir` directly (project root), not inside `.knowledge/`. Use `writeFile` directly, not `writeKnowledgeFile`.
- `generate_knowledge_base` may overwrite existing knowledge files (full regeneration). It does not touch `AGENTS.md`.
- Search is lexical and indexless — there is no vector index to rebuild after writing knowledge files.
- `relativePath` passed to `writeKnowledgeFile` must not start with `.knowledge/` — that prefix is added by the writer.
- If a source directory passed to `generateKnowledgeBase` does not exist, the internal `walkDir` returns an empty list for that path silently. It does not throw.
- Always emit the marker legend (`meta/SOURCE_TIERS.md`) and guardrails (`meta/GUARDRAILS.md`) during `init` so generated KBs are self-describing.

## Interfaces
```typescript
export async function initKnowledgeBase(projectDir: string, projectName?: string): Promise<void>
export async function generateKnowledgeBase(projectDir: string, sourceDirs: string[], languageOverride?: ProjectType): Promise<string>
export async function detectProjectType(projectDir: string): Promise<ProjectType>
export function designProject(idea: string): string
```

`generateKnowledgeBase` picks a language profile from `PROJECT_PROFILES` (`languageOverride` else
`detectProjectType`, fallback `generic`). The profile drives source-file discovery (`extensions` +
`skipDirs`, the latter merged with `NOISE_DIRS` and passed to `walkDir`) and prepends a `Language:`
line plus the profile `languageHint` to the returned text — followed by the unchanged standard-KB
instructions. See `decisions/010-language-profiles`. `ProjectType`/`ProjectProfile` live in `src/types.ts`.

The `initKnowledgeBase` file list (all subject to existence check before write):
```
AGENTS.md                         → TEMPLATE_AGENTS_MD(projectName)      [project root]
.knowledge/canonical/architecture.md  → TEMPLATE_ARCHITECTURE(projectName)
.knowledge/canonical/modules/example.md → TEMPLATE_MODULE('example')
.knowledge/derived/conventions.md     → TEMPLATE_CONVENTIONS()
.knowledge/derived/decisions/001-example.md → TEMPLATE_DECISION('001-example')
.knowledge/meta/SOURCE_TIERS.md       → TEMPLATE_SOURCE_TIERS()
.knowledge/meta/GUARDRAILS.md         → TEMPLATE_GUARDRAILS()
.knowledge/skills/planning.md         → TEMPLATE_SKILL('planning')
.knowledge/skills/coding.md           → TEMPLATE_SKILL('coding')
.knowledge/skills/updater.md          → TEMPLATE_SKILL('updater')
```

## Files
- `src/scaffold/index.ts` — `initKnowledgeBase`, `generateKnowledgeBase`, `designProject`, inline templates (incl. `TEMPLATE_AGENTS_MD`, `TEMPLATE_SOURCE_TIERS`, `TEMPLATE_GUARDRAILS`), private `walkDir`

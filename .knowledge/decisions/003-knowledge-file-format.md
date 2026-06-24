---
module: decisions/003-knowledge-file-format
updated: 2026-06-24
files: ["src/knowledge/reader.ts","src/knowledge/writer.ts"]
---

## Decision
Standardize all `.knowledge/` files with a YAML-like frontmatter block followed by fixed `##`-level section headings. Frontmatter carries `layer` and `tier` so the standard KB (`decisions/007-kb-standard`) is machine-checkable.

## Status
Accepted

## Context
AI agents reading these files need to locate specific kinds of information (interfaces, constraints, usage patterns) without reading entire files. The reader extracts metadata for filtering and staleness detection. With the standard KB, the reader and `verify_knowledge` also need to know each file's **layer** (canonical vs derived) and **tier** (authority ceiling) without parsing prose.

## Format
```
---
module: <name>            (required)
layer: canonical | derived | meta | skill   (required for canonical/derived; optional for meta/skill)
tier: T1 | T2 | T3 | T4    (required on canonical/derived files; the marker ceiling)
updated: <YYYY-MM-DD>     (required)
files: [list of source files this covers]
---

## Purpose
## Decisions
## Patterns
## Constraints
## Interfaces
## Files
```

## Markers & citations (standard KB)
Every factual claim in a `canonical/` or `derived/` file carries exactly one marker: `[EXPLICIT]`, `[INFERRED:strong]`, `[INFERRED:weak]`, `[INFERRED]`, `[ASSUMED]`, or `[MISSING_INFO]`. Every `[EXPLICIT]` claim cites `path` or `path:line`. Markers must not exceed the file's `tier` ceiling and must survive into derived files that reuse them. See `modules/knowledge-standard`.

## Section Semantics
- `## Purpose` — one paragraph: what this module does and why it exists
- `## Decisions` — bullets of non-obvious choices and why; alternatives rejected
- `## Patterns` — how to use this correctly; code examples where helpful
- `## Constraints` — do/don't rules; start each bullet with "Do not", "Never", or "Always"
- `## Interfaces` — key exported types and function signatures; no implementation details
- `## Files` — which source files this module covers and what each does

## Consequences
- Agents can request specific sections by name.
- `verify_knowledge` reads `layer`/`tier` from frontmatter to enforce tier ceilings and the canonical/derived split.
- The reader stays a trivial regex parser; `layer`/`tier` are two more optional string fields (back-compatible — absent fields read as undefined).
- Not all sections are required — omit empty sections rather than writing placeholder text.

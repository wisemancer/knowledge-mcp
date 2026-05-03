---
module: decisions/003-knowledge-file-format
updated: 2026-04-28
files: [src/knowledge/reader.ts, src/knowledge/writer.ts]
---

## Decision
Standardize all `.knowledge/` files with a YAML-like frontmatter block followed by fixed `##`-level section headings.

## Status
Accepted

## Context
AI agents reading these files need to locate specific kinds of information (interfaces, constraints, usage patterns) without reading entire files. The reader module needs to extract metadata (module name, source files list) for filtering and staleness detection. The updater model needs a consistent template to regenerate any file from the same prompt.

## Format
```
---
module: <name>          (required)
updated: <YYYY-MM-DD>   (required)
files: [list of source files this covers]
---

## Purpose
## Decisions
## Patterns
## Constraints
## Interfaces
## Files
```

## Section Semantics
- `## Purpose` — one paragraph: what this module does and why it exists
- `## Decisions` — bullets of non-obvious choices made and why; alternatives rejected
- `## Patterns` — how to use this correctly; code examples where helpful
- `## Constraints` — do/don't rules; start each bullet with "Do not", "Never", or "Always"
- `## Interfaces` — key exported types and function signatures; no implementation details
- `## Files` — which source files this module covers and what each does

## Consequences
- Agents can request specific sections by name.
- The updater model can regenerate any file using the same prompt template.
- Not all sections are required — omit sections with no meaningful content rather than writing placeholder text.
- Reader can be implemented with a trivial regex parser (no YAML library needed).

---
module: decisions/006-design-project
layer: derived
tier: T2
updated: 2026-05-13
files: []
---

## Decision
Add a `design_project` MCP tool that takes a raw idea string and returns a structured design interview document, bridging the gap between a blank project and a filled `.knowledge/` directory.

## Status
Accepted

## Context
`init_knowledge_base` produces blank templates. For a greenfield project, there was no guided path from "I have an idea" to "I have filled knowledge files." Users were expected to fill templates manually or describe their idea conversationally with no structure. Observability, constraints, and error handling were routinely skipped.

## Rationale
Follows the `generate_knowledge_base` pattern: the tool does mechanical work (structuring the idea), returns text, and the calling agent does reasoning (asking the user about gaps, writing files). No LLM call in the tool itself — zero new dependencies. The four required gap markers (Observability NON-NEGOTIABLE, Tech stack, Constraints, Error handling) enforce completeness before any code is written. Observability is surfaced as non-negotiable at the framework level, not left to convention.

## Consequences
- Greenfield flow gains a structured starting point: `design_project` → conversation → `write_knowledge_file` × 2 → `init_knowledge_base` → `write_plan` → code.
- Every new project is forced to define observability before writing any source file.
- `src/scaffold/index.ts` gains one exported function (`designProject`). No new files, no new types, no new dependencies.

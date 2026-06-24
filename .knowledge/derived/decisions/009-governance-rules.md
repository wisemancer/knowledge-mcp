---
module: decisions/009-governance-rules
layer: derived
tier: T2
updated: 2026-06-24
files: ["src/scaffold/index.ts"]
---

## Decision
Add two standard governance sections — `## Security` and `## Collaboration` — to the project-instruction files the tool emits (`CLAUDE.md` and `AGENTS.md` templates) and to this repo's own root files. They are adopted verbatim from the wisengine engines.

## Status
Accepted

## Context
The emitted `CLAUDE.md`/`AGENTS.md` already carry the workflow gates (plan-before-code, knowledge-tools-only, observability, Docker). Two governance concerns were missing that the wisengine engines treat as baseline for every project: a hard secrets-handling rule and a collaboration stance that makes the agent push back rather than comply blindly.

## Rationale
- **Security** — "never read `.env`/secret files; use `.env.example`" is a universal safety rule that belongs in every project's baseline, not left to chance.
- **Collaboration** — instructing the agent to investigate when a report contradicts the code, push back on unclear reasoning, and optimize for making the user better (not just closing the task) raises output quality across the board.
- Putting them in the **emitted templates** (not just this repo) makes them part of the standard every generated project inherits, consistent with `decisions/007-kb-standard`.

## Consequences
- `TEMPLATE_CLAUDE_MD` and `TEMPLATE_AGENTS_MD` in `src/scaffold/index.ts` gain the two sections; every `init` from now on includes them.
- This repo's root `CLAUDE.md` and `AGENTS.md` gain the same sections (dogfooding).
- No code path or tool behavior changes — these are instruction-text additions only.

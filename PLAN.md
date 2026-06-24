# PLAN — Add Security + Collaboration governance rules

Implements `decisions/009-governance-rules`. Branch: `feat/governance-rules` (off `main`).

## Goal
Add two governance sections to the project-instruction files the tool emits AND to this repo's
own root files:

```
## Security
- Never read .env files or any files that may contain secrets (e.g. .env.local, .env.production,
  *.env). Use .env.example files to understand available variables instead.

## Collaboration
- Don't take the user's statements at face value when something seems off. If a reported behavior
  contradicts the code, investigate before acting. Push back when the reasoning is unclear or the
  proposed fix doesn't match the actual problem.
- The goal is to make the user better, not just to complete tasks. Point out when an approach has a
  flaw, when a simpler solution exists, or when a change is unnecessary.
```

## Files to modify
1. `src/scaffold/index.ts` — add both sections to `TEMPLATE_CLAUDE_MD` and `TEMPLATE_AGENTS_MD`
   (after the gate/rule sections, before Build & Verify).
2. `CLAUDE.md` (repo root) — add both sections.
3. `AGENTS.md` (repo root) — add both sections.
4. `.knowledge/canonical/modules/agents-md.md` — note the two new emitted sections (doc accuracy).

## Constraints / observability
- Instruction-text only; no code path, tool, or type changes. Existing observability policy unchanged.
- Templates are inline literals (see `modules/scaffold`), so this is a source edit → rebuild + global
  reinstall required for the changes to take effect in other sessions.

## Verify
`npx tsc --noEmit` → `npm run build` → `npm install -g .` → scaffold a throwaway project and confirm
both sections appear in its generated CLAUDE.md/AGENTS.md → `verify_knowledge` stays clean → commit,
push, PR against `main`.

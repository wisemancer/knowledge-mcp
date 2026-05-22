# Plan: Add Docker rule to scaffold templates

## Context
New framework rule: always recommend Docker over local software installation.
Already added to `.knowledge/conventions.md ## Agent Workflow` and memory.
Need to propagate to scaffold templates so every new project inherits it.

## Files to Change
- `src/scaffold/index.ts` — add Docker rule to `TEMPLATE_CONVENTIONS()` `## Agent Workflow` block
- `src/scaffold/index.ts` — add Docker note to `TEMPLATE_AGENTS_MD()`

## Implementation
1. `TEMPLATE_CONVENTIONS()`: add bullet to `## Agent Workflow`:
   `- **Docker over local installs**: Always recommend Docker for services, databases, and tools. Never suggest installing software directly on the host machine.`

2. `TEMPLATE_AGENTS_MD()`: add line to the Observability Gate block or as its own line:
   `## Environment Rule\nAlways use Docker for services and tools — never install software directly on the host.`

## Verification
- `npx tsc --noEmit`
- `npm run build`

# knowledge-mcp — Claude Code Instructions

## HARD GATES (non-negotiable, every session)

### Gate 1: Plan before code
**Never write or modify source code without a written plan in `PLAN.md`.**

Before any implementation:
1. Call `read_knowledge_base` (no filter) to load the full knowledge base.
2. Update `.knowledge/` files to reflect design intent via `write_knowledge_file`.
3. Call `write_plan` to record the plan in `PLAN.md`.

A plan described in conversation but not written via `write_plan` is **not a plan**. Do not proceed to code until `PLAN.md` exists and reflects the current task.

### Gate 2: Knowledge tools only — never read raw source
During planning and exploration, use only:
- `read_knowledge_base` — read architecture, modules, decisions
- `search_knowledge` — search across the knowledge base

Never use `Read`, `Bash(cat ...)`, or any direct file read on source files (`.ts`, `.js`). Source is for the compiler; `.knowledge/` is for agents.

### Gate 3: Observability before coding
Every feature must have logging, tracing, and metrics defined in `.knowledge/derived/conventions.md ## Observability` before coding starts.

### Gate 4: Docker for all services
Always recommend Docker for services, databases, and tools. Never suggest host-level installs.

---

## Build & Verify
```bash
npm run build        # compile TypeScript → dist/
npm install -g .     # reinstall global binary
npx tsc --noEmit     # type-check only
```
Run build + reinstall after any source change before using the updated MCP in another session.

## Key Constraints
- `process.stdout` is reserved for MCP stdio protocol — all logs go to `process.stderr`.
- MCP tools may only write to: `AGENTS.md`, `PLAN.md`, and files under `.knowledge/`. Never write outside these.
- Config is global (`~/.knowledge-mcp/config.json`). Knowledge is local (project `.knowledge/`).
- No `any` — use `unknown` at boundaries, narrow with Zod or type guards.
- All shared types live in `src/types.ts` — never define types inline in implementation files.

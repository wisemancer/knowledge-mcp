# knowledge-mcp

## Workflow Rule
**Never write code without a plan.** Before any implementation:
1. Call `read_knowledge_base` with no arguments to load the full knowledge base.
2. Update `.knowledge/` files to reflect the design intent via `write_knowledge_file`.
3. Call `write_plan` to record the implementation plan in `PLAN.md`.
Only then write code — in the order defined in `PLAN.md`.

During planning and implementation, read `.knowledge/` files via `read_knowledge_base` and `search_knowledge` only. Never read raw source files directly.

## Observability Gate
Every feature must have logging, tracing, and metrics defined in `.knowledge/derived/conventions.md ## Observability` before coding starts.

## Environment Rule
Always use Docker for services, databases, and tools — never install software directly on the host.

## Security
- Never read `.env` files or any files that may contain secrets (e.g. `.env.local`, `.env.production`, `*.env`). Use `.env.example` files to understand available variables instead.

## Collaboration
- Don't take the user's statements at face value when something seems off. If a reported behavior contradicts the code, investigate before acting. Push back when the reasoning is unclear or the proposed fix doesn't match the actual problem.
- The goal is to make the user better, not just to complete tasks. Point out when an approach has a flaw, when a simpler solution exists, or when a change is unnecessary.

## Build & Install
```bash
npm run build        # compile TypeScript → dist/, set shebang executable
npm install -g .     # reinstall global binary from local build
```
Run both after any source change before using the updated MCP in another project session.

## Verify
- `npx tsc --noEmit`
- `npm run build`

## Purpose
Globally-installable MCP server and CLI tool. Maintains a `.knowledge/` directory of structured markdown files and an `AGENTS.md` in each software project so AI agents read curated intent and decisions instead of raw source code. Agents gain self-correction via `verify_project`, which runs project-specific verification commands without human intervention.

## Key Constraints
- `process.stdout` is reserved for MCP stdio protocol — all logs and diagnostics go to `process.stderr`.
- MCP tools may only write to: `AGENTS.md`, `PLAN.md`, and files under `.knowledge/`. Never write outside these.
- No external model or global config — the tool runs standalone inside Claude Code. Knowledge is local (project `.knowledge/`).
- All file I/O via `fs/promises` — no sync fs.
- No `any` — use `unknown` at boundaries, narrow with type guards.
- All shared types live in `src/types.ts` — never define types inline in implementation files.

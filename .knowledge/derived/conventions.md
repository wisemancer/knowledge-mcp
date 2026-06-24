---
module: conventions
layer: derived
tier: T2
updated: 2026-06-24
files: [src/**/*.ts]
---

## Purpose
Coding standards for the knowledge-mcp TypeScript codebase. These are non-negotiable.

## Agent Workflow
- **Knowledge-first — no code without a plan**: Before suggesting or writing any code, write or update the relevant `.knowledge/` files and call `write_plan` to produce `PLAN.md`. Describe intent, constraints, and interfaces before any implementation exists. This is a hard gate, not a suggestion.
- **Knowledge base only**: During planning and implementation, read `.knowledge/` files via `read_knowledge_base` and `search_knowledge`. Never read raw source files directly. Source files are for the compiler; `.knowledge/` is for agents.
- **Observability is non-negotiable**: Every feature must define its logging, tracing, and metrics coverage in `.knowledge/` before implementation. Agents must not write code for a feature that lacks defined observability.
- **Docker over local installs**: Always recommend Docker for running services, databases, and tools. Never suggest installing software directly on the host machine.

## Observability
- **Logging**: `process.stderr.write()` only (stdout is reserved for MCP wire protocol). Log errors and unexpected states with a `[knowledge-mcp]` prefix.
- **Tracing**: Not required at current scale. Revisit when multi-project or remote scenarios are introduced.
- **Metrics**: Not instrumented. The `verify_project` tool acts as the primary correctness signal.
- **Error reporting**: All errors surface via `KnowledgeError` thrown from library code, caught at MCP handler boundary and returned as `{ isError: true }` responses.

## Patterns
- **ESM imports with `.js` extension**: `import { x } from './foo.js'`. TypeScript under `moduleResolution: NodeNext` resolves `.js` imports to `.ts` source files at compile time.
- **MCP tool inputs declared as JSON Schema**: Each tool's input shape is a JSON Schema object (MCP protocol requirement). Handlers narrow `params` at the boundary with explicit casts/guards. No Zod (the tool has no runtime schema-validation dependency).
- **Named exports only**: No default exports. Internal helpers are not exported.
- **Typed errors**: Throw `KnowledgeError` (extends `Error`) with a typed `code` field. MCP handlers catch and return `{ isError: true, content: [{ type: 'text', text: msg }] }`. CLI handlers catch and write to `process.stderr`, then `process.exit(1)`.

## Decisions
- **No sync fs**: All file I/O via `fs/promises`. Sync methods forbidden.
- **No `any`**: Use `unknown` at boundaries; narrow with type guards.
- **No `console.log`**: MCP uses stdout for wire-format protocol bytes. Use `process.stderr.write()` for all debug output.
- **No external model dependency**: The tool runs fully inside Claude Code — no Anthropic API, no Ollama, no embedding model. See `decisions/008-standalone-mcp`.

## Constraints
- File names: kebab-case (`vector-store.ts`).
- Function names: camelCase. Types/interfaces: PascalCase. Constants: SCREAMING_SNAKE_CASE.
- Indentation: 2 spaces. No tabs. No trailing whitespace.
- Do not use CommonJS (`require`, `module.exports`).
- Do not define types inline in implementation files — all shared types live in `src/types.ts`.

## Build & Install
```bash
npm run build        # compile TypeScript → dist/, set shebang executable
npm install -g .     # reinstall global binary from local build
```
Run both after any source change before using the updated MCP in another project session.
The running MCP server in the current Claude Code session must be restarted to pick up changes.

## Verification
Commands run by the `verify_project` MCP tool to check project correctness. Each project's `conventions.md` defines its own list. The `verify_project` tool reads this section at call time and runs each command in sequence.

Format — one backtick-wrapped command per bullet:
- `npx tsc --noEmit`
- `npm run build`

## Interfaces
See `src/types.ts` for all shared types. Modules import from `'../types.js'`, never from each other's internals.

## Files
```
src/types.ts              — all shared types, interfaces, error class (no config)
src/mcp/server.ts         — MCP Server + stdio transport startup
src/mcp/tools.ts          — tool handler registrations (all 10 tools)
src/knowledge/reader.ts   — read and parse .knowledge/ files (layer/tier frontmatter)
src/knowledge/writer.ts   — write knowledge files with frontmatter
src/knowledge/verify.ts   — verify_knowledge: marker/citation/tier/guardrail checks
src/search/engine.ts      — lexical search (no embeddings, no index)
src/scaffold/index.ts     — init_knowledge_base + generate_knowledge_base + designProject
src/cli/index.ts          — commander.js program + command handlers
src/index.ts              — entrypoint (shebang, argv mode routing)
```

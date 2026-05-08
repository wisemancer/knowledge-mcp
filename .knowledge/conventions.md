---
module: conventions
updated: 2026-05-04
files: [src/**/*.ts]
---

## Purpose
Coding standards for the knowledge-mcp TypeScript codebase. These are non-negotiable.

## Patterns
- **ESM imports with `.js` extension**: `import { x } from './foo.js'`. TypeScript under `moduleResolution: NodeNext` resolves `.js` imports to `.ts` source files at compile time.
- **Zod at system boundaries only**: Validate all MCP tool inputs and config file data with Zod. Internal functions receive already-typed values.
- **Named exports only**: No default exports. One `index.ts` barrel per `src/<module>/` directory that re-exports the public API. Internal helpers are not exported from barrels.
- **Typed errors**: Throw `KnowledgeError` (extends `Error`) with a typed `code` field. MCP handlers catch and return `{ isError: true, content: [{ type: 'text', text: msg }] }`. CLI handlers catch and write to `process.stderr`, then `process.exit(1)`.

## Decisions
- **No sync fs**: All file I/O via `fs/promises`. Sync methods forbidden.
- **No `any`**: Use `unknown` at boundaries; narrow with Zod or type guards.
- **No `console.log`**: MCP uses stdout for wire-format protocol bytes. Use `process.stderr.write()` for all debug output.
- **Types inferred from Zod**: `type Config = z.infer<typeof ConfigSchema>`. Do not write parallel TypeScript interfaces for Zod-validated data.

## Constraints
- File names: kebab-case (`vector-store.ts`).
- Function names: camelCase. Types/interfaces: PascalCase. Constants: SCREAMING_SNAKE_CASE.
- Indentation: 2 spaces. No tabs. No trailing whitespace.
- Do not use CommonJS (`require`, `module.exports`).
- Do not define types inline in implementation files — all shared types live in `src/types.ts`.

## Verification
Commands run by the `verify_project` MCP tool to check project correctness. Each project's `conventions.md` defines its own list. The `verify_project` tool reads this section at call time and runs each command in sequence.

Format — one backtick-wrapped command per bullet:
- `npx tsc --noEmit`

Add more commands as the project grows (e.g. `npm test`, `npm run lint`). Commands run in the project working directory captured at MCP server startup.

## Interfaces
See `src/types.ts` for all shared types. Modules import from `'../types.js'`, never from each other's internals.

## Files
```
src/types.ts              — all shared types, interfaces, error class, ConfigSchema
src/config.ts             — config loading and defaults
src/mcp/server.ts         — MCP Server + stdio transport startup
src/mcp/tools.ts          — tool handler registrations (all 7 tools)
src/knowledge/reader.ts   — read and parse .knowledge/ files
src/knowledge/writer.ts   — write knowledge files with frontmatter
src/search/engine.ts      — semantic search orchestration
src/search/vector-store.ts — JSON vector index CRUD
src/ollama/client.ts      — Ollama embed + generate HTTP client
src/claude/client.ts      — Anthropic SDK messages wrapper
src/scaffold/index.ts     — init_knowledge_base + generate_knowledge_base
src/cli/index.ts          — commander.js program + command handlers
src/index.ts              — entrypoint (shebang, mode routing)
```

---
module: cli
updated: 2026-05-04
files: [src/cli/index.ts, src/index.ts]
---

## Purpose
Commander.js CLI entrypoint. Maps subcommands (`init`, `generate`, `update`, `search`, `serve`) to core module functions. Handles human-readable output to stdout and errors to stderr. `src/index.ts` is the universal entrypoint that routes to either the MCP server or the CLI.

## Decisions
- **`src/index.ts` as universal entrypoint**: If `process.argv[2]` is `serve`, `server`, or absent, start the MCP server (MCP clients invoke the binary with no args; `serve`/`server` are explicit aliases). Any other value is routed to the CLI module.
- **CLI imports nothing from `src/mcp/`**: `cli/index.ts` calls `startServer` via dynamic import inside the `serve` action, not a top-level import. This prevents CLI from pulling in MCP server code unnecessarily.
- **No config**: The tool is standalone (no external model), so there is no config to load. `index.ts` routes on argv only. See `decisions/008-standalone-mcp.md`.
- **`update <module>` is agent-driven**: Calls `readKnowledgeBase` for the target module, reads the changed source files, and prints the current doc + changed source for an agent to rewrite. No model call.

## Patterns
```typescript
// src/index.ts (simplified)
const arg = process.argv[2];
if (!arg || arg === 'serve' || arg === 'server') {
  await startServer();
} else {
  await runCLI(process.argv.slice(2));  // pre-sliced; see decisions/004-cli-argv-parsing
}
```

`runCLI` receives a pre-sliced argv (no `node` path, no script path). `program.parseAsync` must be called with `{ from: 'user' }` to prevent Commander from stripping two more elements. See `decisions/004-cli-argv-parsing.md`.

The `generate` command delegates entirely to `generateKnowledgeBase` from `src/scaffold/index.ts`. The CLI does not reimplement file collection.

## Constraints
- All CLI errors: `process.stderr.write(msg + '\n'); process.exit(1)`.
- `search` command output format: `[{score:.2f}] {module} > {section}: {text}` — one result per line.
- Shebang `#!/usr/bin/env node` must be the first line of `src/index.ts` for global install to work.
- Do not use `console.log` even in CLI mode for consistency; use `process.stdout.write`.

## Interfaces
```typescript
// src/cli/index.ts
export async function runCLI(argv: string[]): Promise<void>

// Commands:
// init [projectName]            — calls initKnowledgeBase(cwd, projectName)
// generate -d <dir...>          — delegates to generateKnowledgeBase(cwd, dirs) in scaffold
// update <module> [-f <files>]  — prints current doc + changed source for an agent to rewrite
// search <query> [-k <n>]       — calls searchKnowledge (lexical), prints results
// serve                         — calls startServer()
```

## Files
- `src/index.ts` — shebang, argv mode routing to `startServer` or `runCLI`
- `src/cli/index.ts` — commander `program`, all command definitions and handlers

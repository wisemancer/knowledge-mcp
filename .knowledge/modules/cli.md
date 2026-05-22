---
module: cli
updated: 2026-05-04
files: [src/cli/index.ts, src/index.ts]
---

## Purpose
Commander.js CLI entrypoint. Maps subcommands (`init`, `generate`, `update`, `search`, `serve`) to core module functions. Handles human-readable output to stdout and errors to stderr. `src/index.ts` is the universal entrypoint that routes to either the MCP server or the CLI.

## Decisions
- **`src/index.ts` as universal entrypoint**: If `process.argv[2]` is `serve`, `server`, or absent, start the MCP server (MCP clients invoke the binary with no args; `serve`/`server` are explicit aliases). Any other value is routed to the CLI module.
- **CLI imports nothing from `src/mcp/`**: `cli/index.ts` calls `startServer` via `src/index.ts` routing, not a direct import. This prevents CLI from pulling in MCP server code unnecessarily.
- **Config loaded in `index.ts`**: Both paths (MCP and CLI) need config. Load it once in `index.ts`, pass to whichever path is taken.
- **`update [module]` with Ollama**: Calls `readKnowledgeBase` to get the target module, reads its source files, calls `OllamaClient.generate` with a regeneration prompt, writes the result back.

## Patterns
```typescript
// src/index.ts (simplified)
const config = await loadConfig();
const arg = process.argv[2];
if (!arg || arg === 'serve' || arg === 'server') {
  await startServer(config);
} else {
  await runCLI(config, process.argv.slice(2));  // pre-sliced; see decisions/004-cli-argv-parsing
}
```

`runCLI` receives a pre-sliced argv (no `node` path, no script path). `program.parseAsync` must be called with `{ from: 'user' }` to prevent Commander from stripping two more elements. See `decisions/004-cli-argv-parsing.md`.

The `generate` command delegates entirely to `generateKnowledgeBase` from `src/scaffold/index.ts`. The CLI does not reimplement file collection or Claude calls.

## Constraints
- All CLI errors: `process.stderr.write(msg + '\n'); process.exit(1)`.
- `search` command output format: `[{score:.2f}] {module} > {section}: {text}` — one result per line.
- Shebang `#!/usr/bin/env node` must be the first line of `src/index.ts` for global install to work.
- Do not use `console.log` even in CLI mode for consistency; use `process.stdout.write`.

## Interfaces
```typescript
// src/cli/index.ts
export async function runCLI(config: Config, argv: string[]): Promise<void>

// Commands:
// init [projectName]            — calls initKnowledgeBase(cwd, projectName)
// generate [-d <dir...>]        — delegates to generateKnowledgeBase(cwd, config, dirs) in scaffold
// update [module]               — updates one or all modules via Ollama
// search <query> [--top <n>]    — calls searchKnowledge, prints results
// serve                         — calls startServer(config)
```

## Files
- `src/index.ts` — shebang, `loadConfig`, mode routing to `startServer` or `runCLI`
- `src/cli/index.ts` — commander `program`, all command definitions and handlers

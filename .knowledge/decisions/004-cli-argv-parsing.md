---
module: decisions/004-cli-argv-parsing
updated: 2026-05-04
files: [src/index.ts, src/cli/index.ts]
---

## Decision
Pass `process.argv.slice(2)` from `src/index.ts` to `runCLI`, and call `program.parseAsync(args, { from: 'user' })` inside `src/cli/index.ts`.

## Status
Accepted

## Context
Commander's default `parseAsync` behavior (the `{ from: 'node' }` default) assumes it receives the full `process.argv` array — with the `node` binary and script path as the first two elements — and strips them internally. If `index.ts` pre-slices the array and `cli/index.ts` also uses the default behavior, Commander strips two more elements and loses the subcommand name entirely. All CLI subcommands silently fall through to the help screen with no error.

Two valid approaches exist:
1. Pass the full `process.argv` (unsliced) to `runCLI` and let Commander strip internally.
2. Pre-slice in `index.ts` (which already inspects `process.argv[2]` to decide MCP vs CLI mode) and tell Commander not to strip via `{ from: 'user' }`.

Option 2 was chosen so `runCLI` receives exactly the args it needs with no implicit stripping dependency on the caller.

## Rationale
`{ from: 'user' }` makes the contract explicit: `runCLI(config, argv)` always receives a pre-sliced array (no `node` binary path, no script path), and Commander respects that. Option 1 would make `runCLI` implicitly depend on receiving a full `process.argv`-shaped array, which is a hidden contract that breaks if the caller ever changes.

## Consequences
- `runCLI` always receives `process.argv.slice(2)` — never the full `process.argv`.
- Do NOT change `parseAsync(args, { from: 'user' })` back to `parseAsync(args)` — the option is load-bearing; removing it silently breaks all subcommands.
- Do NOT pass the full `process.argv` (unsliced) to `runCLI` — that would also cause double-stripping under the current setup.

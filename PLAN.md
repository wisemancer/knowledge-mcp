# Fix Plan: Align Implementation with Knowledge Base

## Before writing any code

Read these knowledge docs in order:
1. `.knowledge/architecture.md` — stdout constraint, MCP/CLI routing, module boundaries
2. `.knowledge/conventions.md` — no `require`, no `console.log`, ESM imports, no `any`
3. `.knowledge/modules/cli.md` — routing logic, argv pattern, `generate` delegation
4. `.knowledge/modules/mcp-server.md` — `registerTools` signature, `update_knowledge` write path
5. `.knowledge/modules/scaffold.md` — `generateKnowledgeBase` param order, `walkDir` constraint
6. `.knowledge/decisions/004-cli-argv-parsing.md` — why `{ from: 'user' }` is load-bearing

---

## What changed in the knowledge base (and why this plan exists)

The following module docs were updated on 2026-05-04 to correct inaccuracies. The code must now be brought in line with what the docs describe.

| Doc | What changed |
|---|---|
| `cli.md` | MCP routing handles absent + `serve` + `server`; argv is pre-sliced, parseAsync uses `{ from: 'user' }`; `generate` delegates to scaffold |
| `mcp-server.md` | `registerTools(server, projectDir, config)` — `projectDir` is second, `config` is third |
| `scaffold.md` | `generateKnowledgeBase(projectDir, config, sourceDirs)` — `config` before `sourceDirs`; `walkDir` must not throw on missing dirs |
| `decisions/004` | New — `{ from: 'user' }` is required in `program.parseAsync` |

---

## Files to modify

No new files. No new dependencies. No type changes to `src/types.ts`.

---

## Implementation order

### Step 1 — `src/index.ts`

**What to fix:** The MCP routing condition.

Current code only starts the MCP server when `process.argv[2] === 'server'`. Per `cli.md` Decisions, the server must also start when the arg is `'serve'` or absent (no args = MCP client invocation).

```typescript
// Replace the routing block with:
const arg = process.argv[2];
if (!arg || arg === 'serve' || arg === 'server') {
  await startServer(config);
} else {
  await runCLI(config, process.argv.slice(2));
}
```

Run `npx tsc --noEmit` before proceeding.

---

### Step 2 — `src/scaffold/index.ts`

**What to fix:** Two things.

**2a. Unused imports** — Remove from the types import line:
- `KnowledgeMeta`, `SearchResult`, `VectorEntry` (none are used)

Remove from the engine import line:
- `searchKnowledge` (not used)

**2b. `walkDir` error handling** — Per `scaffold.md` Constraints, if a source directory does not exist, `walkDir` must return an empty list silently without throwing. The current implementation lets `readdir` throw. Add a try/catch around `readdir` matching the pattern used in `src/knowledge/reader.ts`:

```typescript
async function walkDir(dir: string): Promise<string[]> {
  const results: string[] = [];
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return results;
  }
  // rest of the loop unchanged
}
```

Run `npx tsc --noEmit` before proceeding.

---

### Step 3 — `src/mcp/tools.ts`

**What to fix:** Three things.

**3a. Static import for `generateKnowledgeBase`** — It is currently dynamically imported inside the `generate_knowledge_base` case. The module is already loaded (via the static `initKnowledgeBase` import). Promote it to the static import at the top:

```typescript
import { initKnowledgeBase, generateKnowledgeBase } from '../scaffold/index.js';
```

Remove the `await import(...)` block inside the `generate_knowledge_base` case and call `generateKnowledgeBase` directly.

**3b. `update_knowledge` write path** — The handler currently writes to `${module}.md`. Per `knowledge-io.md`, `writeKnowledgeFile` takes a `relativePath` relative to `.knowledge/`. A module at `.knowledge/modules/example.md` has `module: example` — writing to `example.md` creates a duplicate at the wrong location and leaves the original stale.

Fix: derive the write path from the original file's absolute path:

```typescript
import { relative } from 'path';
// inside update_knowledge case, after reading knowledge[0]:
const kDir = join(resolve(projectDir), '.knowledge');
const relPath = relative(kDir, knowledge[0].path);
await writeKnowledgeFile(projectDir, relPath, newContent);
```

**3c. Unused imports** — Remove:
- From `fs/promises` import: `readFile`, `mkdir`, `access`, `readdir`, `stat`
- Entire `import { constants } from 'fs'` line
- `KnowledgeFile` from the types import
- `getConfigPath` from the config import (entire line if it is the only item)

Run `npx tsc --noEmit` before proceeding.

---

### Step 4 — `src/cli/index.ts`

**What to fix:** Five things.

**4a. `require()` calls** — Per `conventions.md`, `require` is CommonJS and not available in ESM modules. The `update` command action (around line 224–231) uses `require("path")` and `require("fs/promises")`. Both modules are already imported at the top of the file. Replace:

```typescript
// Before:
const fullPath = require("path").join(require("path").resolve(projectDir), f);
const content = await require("fs/promises").readFile(fullPath, "utf-8");

// After:
const fullPath = join(resolve(projectDir), f);
const content = await readFile(fullPath, "utf-8");
```

**4b. Commander argv** — Per `cli.md` Patterns and `decisions/004-cli-argv-parsing.md`, `program.parseAsync` must be called with `{ from: 'user' }`. The current call `program.parseAsync(args)` uses the default `{ from: 'node' }` which strips the first two elements of an already-sliced array, breaking all subcommands:

```typescript
// Before:
await program.parseAsync(args);

// After:
await program.parseAsync(args, { from: 'user' });
```

**4c. `update` command write path** — Same bug as Step 3b. Apply the same fix using `relative(kDir, files[0].path)` to derive the correct write path from the original file location.

**4d. `generate` command** — Per `cli.md` Patterns, the `generate` command must delegate entirely to `generateKnowledgeBase` from `src/scaffold/index.ts`. The CLI must not reimplement file collection or Claude calls. Replace the entire generate action body:

```typescript
import { initKnowledgeBase, generateKnowledgeBase } from '../scaffold/index.js';

// generate action:
.action(async (opts: { sourceDirs: string[] }) => {
  try {
    const projectDir = process.cwd();
    const sourceDirs = opts.sourceDirs.flatMap((d: string) =>
      d.includes(',') ? d.split(',').map((s: string) => s.trim()) : [d]
    );
    if (sourceDirs.length === 0) {
      process.stderr.write('Error: No source directories specified.\n');
      process.exit(1);
    }
    await generateKnowledgeBase(projectDir, config, sourceDirs);
    process.stdout.write('Knowledge base generated successfully.\n');
  } catch (error) {
    process.stderr.write(`Error: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
})
```

Remove the local `walkDir` and `getExt` helpers if they are no longer used after this change.

**4e. Unused imports** — Remove `KnowledgeError` from the types import (unused after 4d). Confirm `resolve` is present in the path import (needed for 4c).

Run `npx tsc --noEmit` before proceeding.

---

## Verification

After all four steps:

1. `npm run typecheck` — zero errors
2. `npm run build` — compiles; `dist/index.js` is executable
3. `node dist/index.js` — starts MCP server (no CLI help screen)
4. `node dist/index.js serve` — same
5. `node dist/index.js init test-project` — creates `.knowledge/` scaffold
6. `node dist/index.js update architecture -f src/index.ts` — no `require is not defined` error
7. `node dist/index.js search "vector store"` — runs without unhandled exception (Ollama error is acceptable)

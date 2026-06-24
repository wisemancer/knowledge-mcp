---
module: skills/coding
updated: 2026-04-28
files: []
---

## Purpose
Instructions for the coding model implementing knowledge-mcp from PLAN.md. The coding model has access to PLAN.md and the `.knowledge/` directory only — no other context.

## Before writing any code

1. Read `PLAN.md` completely. Understand the full file inventory and implementation order before touching anything.
2. Read `.knowledge/architecture.md` for the system shape and data flow.
3. Read `.knowledge/conventions.md` — these rules are non-negotiable.
4. For each file you are about to implement, read its module doc in `.knowledge/modules/`.

## Implementation rules

- **Implement in the order given in PLAN.md**. Dependencies must compile before dependents.
- **`src/types.ts` first**: All shared interfaces and the `KnowledgeError` class live here. Do not define types inline in implementation files.
- **Match interface contracts exactly**: Function signatures in each module's `## Interfaces` section are contracts. Do not rename, add, or remove parameters without updating the module doc.
- **No stdout in library code**: Any debug output goes to `process.stderr.write(...)`. This is critical — MCP server mode uses stdout for the protocol wire format.
- **ESM `.js` imports**: Every local import uses `.js` extension: `import { x } from './foo.js'`. This is required for Node ESM under `moduleResolution: NodeNext`.
- **Shebang in `src/index.ts`**: The very first line of `src/index.ts` must be `#!/usr/bin/env node`.
- **MCP tool inputs are JSON Schema**: declare each tool's input as a JSON Schema object and narrow `params` at the handler boundary with explicit casts/guards. There is no runtime schema-validation library (no Zod).

## After each file

Run `npx tsc --noEmit` to check for type errors before moving to the next file. Fix all errors before proceeding.

## When you encounter ambiguity

Search `.knowledge/` with `read_knowledge_base` or `search_knowledge` for the relevant concept. If no guidance exists, prefer the simplest implementation that satisfies the declared interface.

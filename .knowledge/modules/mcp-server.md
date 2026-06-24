---
module: mcp-server
updated: 2026-06-24
files: ["src/mcp/server.ts","src/mcp/tools.ts"]
---

## Purpose
Initializes the MCP server, registers all ten tools with their input schemas and handlers, and connects to stdio transport. Tool handlers delegate to core modules (knowledge-io, search, scaffold) and to the in-handler knowledge validator.

## Decisions
- **`tools.ts` handles all ten tools**: `server.ts` is wiring only (`new Server`, `registerTools`, `connect`). Keeping tools together makes the tool surface easy to audit.
- **`cwd` captured at startup**: `process.cwd()` is resolved once when the server starts. MCP clients cannot change the working directory mid-session.
- **Zod validation inside each handler**: each handler parses `request.params.arguments` through its Zod schema before any logic. Invalid input returns `isError: true`, never throws.
- **`setRequestHandler` API**: uses `ListToolsRequestSchema` + `CallToolRequestSchema`. Tool input schemas are JSON Schema objects (MCP protocol requirement), not Zod.

## Patterns — Tool Behaviours

**`read_knowledge_base`** — no `module` arg returns all knowledge files AND `AGENTS.md` (the canonical "full project context" call). A `module` filter excludes AGENTS.md.

**`generate_knowledge_base`** — collects source files (≤100KB) and returns them as formatted text with instructions that demand the standard KB (canonical/derived split, markers, citations, tier ceilings, guardrail self-review, then `verify_knowledge`). No LLM call.

**`write_knowledge_file`** — writes a single file to `.knowledge/` and rebuilds the vector index. `path` is relative to `.knowledge/` (e.g. `"canonical/modules/auth.md"`).

**`verify_knowledge`** — objective, mechanical validation of the KB against the standard (`decisions/007-kb-standard`). Reads every `.knowledge/**/*.md`, parses frontmatter (`layer`, `tier`) and marker/citation usage, and reports graded findings: BLOCK (KG1/KG2/KG3 — fabricated file refs, marker dropped between canonical and derived, `[EXPLICIT]` without citation, marker above tier ceiling) and FLAG (KG4/KG5/KG6 — marker inflation, single-source, staleness). Returns a pass/fail summary plus per-file findings. Read-only — mutates nothing. This is the Verifier in the Writer→Reviewer→Verifier loop. Input schema: `{ type: 'object', properties: {} }` — no parameters.

**`verify_project`** — reads `## Verification` from `conventions.md`, runs each `` - `<command>` `` bullet sequentially via promisified `child_process.exec` (60s timeout each), returns combined stdout+stderr. Does not mutate files.

**`design_project`** — takes a free-form `idea` string and returns a structured design interview document (Observability NON-NEGOTIABLE, Tech stack, Constraints, Error handling), framed in the standard's marker/layer terms. No LLM call, no file I/O.

## Constraints
- Never write to `process.stdout` in any tool handler. MCP transport owns stdout.
- All tool handlers must be non-throwing: catch all errors, return `{ isError: true, content: [{ type: 'text', text: e.message }] }`.
- Tool names are exact: `read_knowledge_base`, `search_knowledge`, `write_plan`, `update_knowledge`, `init_knowledge_base`, `generate_knowledge_base`, `write_knowledge_file`, `verify_project`, `design_project`, `verify_knowledge`.
- `write_knowledge_file` path must not start with `.knowledge/` — that prefix is added by the writer internally.
- `verify_knowledge` is read-only and non-throwing; on a malformed file it records a finding rather than aborting the whole run.

## Interfaces
```typescript
// src/mcp/server.ts
export async function startServer(config: Config): Promise<void>
// src/mcp/tools.ts
export function registerTools(server: Server, projectDir: string, config: Config): void
// Handler return type: { content: Array<{ type: 'text'; text: string }>, isError?: boolean }
```

## Files
- `src/mcp/server.ts` — Server instantiation, `registerTools` call, `StdioServerTransport` connection
- `src/mcp/tools.ts` — `registerTools` with all ten `CallToolRequestSchema` handler branches, incl. the `verify_knowledge` validator

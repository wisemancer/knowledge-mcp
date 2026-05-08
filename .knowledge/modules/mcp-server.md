---
module: mcp-server
updated: 2026-05-04
files: [src/mcp/server.ts, src/mcp/tools.ts]
---

## Purpose
Initializes the MCP server, registers all seven tools with their input schemas and handlers, and connects to stdio transport. Tool handlers delegate to core modules (knowledge-io, search, scaffold).

## Decisions
- **`tools.ts` handles all seven tools**: `server.ts` is wiring only (`new Server`, `registerTools`, `connect`). Keeping tools together makes the tool surface easy to audit.
- **`cwd` captured at startup**: `process.cwd()` is resolved once when the server starts. MCP clients cannot change the working directory mid-session.
- **Zod validation inside each handler**: Each handler parses `request.params.arguments` through its Zod schema before any logic. Invalid input returns `isError: true`, never throws.
- **`setRequestHandler` API**: Uses `ListToolsRequestSchema` + `CallToolRequestSchema` from `@modelcontextprotocol/sdk/types.js`. Tool input schemas are expressed as JSON Schema objects (not Zod — MCP protocol requires JSON Schema).

## Patterns
```typescript
// server.ts
const server = new Server(
  { name: 'knowledge-mcp', version: '0.1.0' },
  { capabilities: { tools: {} } }
);
registerTools(server, cwd, config);
const transport = new StdioServerTransport();
await server.connect(transport);
```

## Patterns — Tool Behaviours

**`read_knowledge_base`** — when called with no `module` argument, returns all knowledge files AND the contents of `AGENTS.md` (project root) if it exists. AGENTS.md is appended after the knowledge files in the response. This makes the no-arg call the canonical "full project context" call for agents starting a session. When a `module` filter is provided, AGENTS.md is not included.

**`verify_project`** — reads the `## Verification` section from `.knowledge/conventions.md`, extracts each `` - `<command>` `` bullet, runs them sequentially in the project working directory using `child_process.exec`, and returns combined stdout + stderr for each command. If no `## Verification` section exists, returns a message explaining how to add one. Does not mutate any files.

Input schema for `verify_project`: `{ type: 'object', properties: {} }` — no parameters.

## Constraints
- Never write to `process.stdout` in any tool handler. MCP transport owns stdout.
- All tool handlers must be non-throwing: catch all errors, return `{ isError: true, content: [{ type: 'text', text: e.message }] }`.
- Tool names are exact: `read_knowledge_base`, `search_knowledge`, `write_plan`, `update_knowledge`, `init_knowledge_base`, `generate_knowledge_base`, `verify_project`.
- `verify_project` uses `child_process.exec` (promisified), not `execSync`. The handler must be async and await each command. Commands time out after 60 seconds each.
- `verify_project` does not shell-escape commands — they are taken verbatim from conventions.md. Conventions.md is a trusted project file, not user input.

## Interfaces
```typescript
// src/mcp/server.ts
export async function startServer(config: Config): Promise<void>

// src/mcp/tools.ts
export function registerTools(server: Server, projectDir: string, config: Config): void

// Handler return type (from MCP SDK):
// { content: Array<{ type: 'text'; text: string }>, isError?: boolean }
```

## Files
- `src/mcp/server.ts` — Server instantiation, `registerTools` call, `StdioServerTransport` connection
- `src/mcp/tools.ts` — `registerTools` function with all seven `CallToolRequestSchema` handler branches

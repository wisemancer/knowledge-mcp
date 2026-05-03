---
module: mcp-server
updated: 2026-04-28
files: [src/mcp/server.ts, src/mcp/tools.ts]
---

## Purpose
Initializes the MCP server, registers all six tools with their input schemas and handlers, and connects to stdio transport. Tool handlers delegate to core modules (knowledge-io, search, scaffold).

## Decisions
- **`tools.ts` handles all six tools**: `server.ts` is wiring only (`new Server`, `registerTools`, `connect`). Keeping tools together makes the tool surface easy to audit.
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
registerTools(server, config, cwd);
const transport = new StdioServerTransport();
await server.connect(transport);
```

## Constraints
- Never write to `process.stdout` in any tool handler. MCP transport owns stdout.
- All tool handlers must be non-throwing: catch all errors, return `{ isError: true, content: [{ type: 'text', text: e.message }] }`.
- Tool names are exact: `read_knowledge_base`, `search_knowledge`, `write_plan`, `update_knowledge`, `init_knowledge_base`, `generate_knowledge_base`.

## Interfaces
```typescript
// src/mcp/server.ts
export async function startServer(config: Config): Promise<void>

// src/mcp/tools.ts
export function registerTools(server: Server, config: Config, cwd: string): void

// Handler return type (from MCP SDK):
// { content: Array<{ type: 'text'; text: string }>, isError?: boolean }
```

## Files
- `src/mcp/server.ts` — Server instantiation, `registerTools` call, `StdioServerTransport` connection
- `src/mcp/tools.ts` — `registerTools` function with all six `CallToolRequestSchema` handler branches

---
module: config
updated: 2026-04-28
files: [src/config.ts, src/types.ts]
---

## Purpose
Loads and validates the global user configuration from `~/.knowledge-mcp/config.json`. Provides typed defaults so the tool works with Ollama-only setups — no Anthropic API key required for basic operation.

## Decisions
- **Zod schema is the canonical type**: `type Config = z.infer<typeof ConfigSchema>`. The schema lives in `src/types.ts` (not `config.ts`) so other modules can import it without creating circular deps.
- **Missing config file returns defaults**: A missing or malformed config file is not an error — `loadConfig` returns Zod defaults. A missing `anthropic_api_key` only errors at the call site when Claude is actually needed.
- **Env var override for config path**: `KNOWLEDGE_MCP_CONFIG` env var overrides the default path (useful for testing).

## Patterns
```typescript
// Called once at startup in src/index.ts
const config = await loadConfig();
// Passed explicitly to any function that needs it — no global singleton
```

## Constraints
- Never throw if the config file is absent; return Zod defaults.
- Never log the API key value, even to stderr.
- Default `ollama_host`: `"http://localhost:11434"`.
- Default `ollama_model`: `"qwen2.5-coder:7b"`.
- Default `embed_model`: `"nomic-embed-text"`.
- Default `claude_model`: `"claude-sonnet-4-6"`.

## Interfaces
```typescript
// In src/types.ts:
export const ConfigSchema = z.object({
  ollama_host: z.string().default('http://localhost:11434'),
  ollama_model: z.string().default('qwen2.5-coder:7b'),
  embed_model: z.string().default('nomic-embed-text'),
  anthropic_api_key: z.string().optional(),
  claude_model: z.string().default('claude-sonnet-4-6'),
});
export type Config = z.infer<typeof ConfigSchema>;

// In src/config.ts:
export function getConfigPath(): string
export async function loadConfig(): Promise<Config>
```

## Files
- `src/types.ts` — `ConfigSchema`, `Config` type
- `src/config.ts` — `loadConfig`, `getConfigPath`

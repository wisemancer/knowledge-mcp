---
module: claude-client
updated: 2026-04-28
files: [src/claude/client.ts]
---

## Purpose
Thin wrapper around `@anthropic-ai/sdk`. Single operation: `generate(prompt, systemPrompt?)` sends a one-turn message and returns the text response. Used only by `scaffold/index.ts` for initial knowledge base generation — not called during normal MCP serve loops.

## Decisions
- **Messages API, non-streaming**: `client.messages.create(...)` with a single user turn. Streaming adds complexity with no benefit for batch generation.
- **Throws on missing API key**: `createClaudeClient(config)` throws `KnowledgeError('CLAUDE_UNAVAILABLE')` immediately if `config.anthropic_api_key` is undefined. Callers must check config before constructing the client.
- **Model from config**: Always passes `config.claude_model` as the `model` field. Never hardcodes a model string.

## Patterns
```typescript
// Caller checks config before constructing
if (!config.anthropic_api_key) throw new KnowledgeError('CLAUDE_UNAVAILABLE', '...');
const claude = createClaudeClient(config);
const result = await claude.generate(userPrompt, systemPrompt);
```

## Constraints
- Never log `config.anthropic_api_key`.
- `max_tokens`: 4096 for single-module doc generation; 8192 for full knowledge base generation. Pass as parameter or hardcode 8192 (safe upper bound).
- If the first content block is not `type: 'text'`, throw `KnowledgeError('CLAUDE_UNAVAILABLE', 'Unexpected response type')`.

## Interfaces
```typescript
export interface ClaudeClient {
  generate(prompt: string, systemPrompt?: string): Promise<string>;
}

export function createClaudeClient(config: Config): ClaudeClient

// Uses: @anthropic-ai/sdk client.messages.create({
//   model: config.claude_model,
//   max_tokens: 8192,
//   system: systemPrompt,
//   messages: [{ role: 'user', content: prompt }]
// })
```

## Files
- `src/claude/client.ts` — `createClaudeClient`, `ClaudeClient` implementation

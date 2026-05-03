---
module: ollama-client
updated: 2026-04-28
files: [src/ollama/client.ts]
---

## Purpose
HTTP client for Ollama's REST API. Two operations: `embed` generates an embedding vector for a text string (used by the search engine), and `generate` produces a text completion (used by `update_knowledge`). Uses native `fetch` — no SDK dependency.

## Decisions
- **No Ollama SDK**: The two endpoints used (`POST /api/embeddings`, `POST /api/generate`) are stable and simple. A thin client avoids a dependency and works with any Ollama version.
- **`stream: false` for generate**: Simplifies implementation. Knowledge updates are offline/batch; streaming latency is not a benefit.
- **Factory function pattern**: `createOllamaClient(config)` returns an `OllamaClient` object. Config is closed over — callers don't thread config through every call.

## Patterns
```typescript
const ollama = createOllamaClient(config);
const vec = await ollama.embed('some text to embed');
const doc = await ollama.generate('Regenerate this module doc given these changes...');
```

## Constraints
- Embed timeout: 30 seconds via `AbortController`.
- Generate timeout: 120 seconds via `AbortController`.
- On any non-2xx response or network error, throw `KnowledgeError('OLLAMA_UNAVAILABLE', msg)`.
- Do not retry. The caller decides retry policy.
- Never log request bodies — they may contain proprietary source code.

## Interfaces
```typescript
export interface OllamaClient {
  embed(text: string): Promise<number[]>;
  generate(prompt: string): Promise<string>;
}

export function createOllamaClient(config: Config): OllamaClient

// Ollama REST endpoints used:
// POST /api/embeddings  body: { model, prompt }  → { embedding: number[] }
// POST /api/generate    body: { model, prompt, stream: false }  → { response: string }
```

## Files
- `src/ollama/client.ts` — `createOllamaClient`, `OllamaClient` implementation with timeout handling

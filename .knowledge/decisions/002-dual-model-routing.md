---
module: decisions/002-dual-model-routing
updated: 2026-04-28
files: [src/scaffold/index.ts, src/claude/client.ts, src/ollama/client.ts]
---

## Decision
Use the Claude API for initial full-codebase knowledge generation; use Ollama (local model) for incremental per-module updates.

## Status
Accepted

## Context
Two operations have fundamentally different characteristics:

1. **Initial generation** (`generate_knowledge_base`): Reads potentially large amounts of source code across many files, requires structural reasoning about the whole codebase, runs once (or rarely after major refactors).

2. **Incremental update** (`update_knowledge`): Looks at a handful of changed files, regenerates one module doc, runs frequently (after each PR or commit batch).

## Rationale
Claude excels at structural reasoning over large contexts — exactly what initial generation needs. But calling Claude for every incremental update costs money and introduces network latency for an operation that should feel instant. A 7B code model (e.g., `qwen2.5-coder:7b`) running locally via Ollama handles "here are the changed files, update this module doc" adequately with zero marginal cost and sub-second response time.

## Consequences
- Ollama must be running locally for `update_knowledge` and `search_knowledge`.
- An Anthropic API key is required only for `generate_knowledge_base` — all other operations work without one.
- Two models to configure, but sensible defaults handle the common case.
- The quality gap for incremental updates (7B vs Claude) is acceptable because module docs are small, structured, and the model has the current doc as a reference to update from.

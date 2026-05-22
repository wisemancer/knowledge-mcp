---
module: decisions/002-dual-model-routing
updated: 2026-05-08
files: [src/scaffold/index.ts, src/ollama/client.ts]
---

## Decision
~~Use the Claude API for initial full-codebase knowledge generation; use Ollama for incremental updates.~~

**Superseded (2026-05-08):** `generate_knowledge_base` no longer calls any external API. It collects source files and returns them as text; the calling agent (Claude Code) performs the reasoning and writes files via `write_knowledge_file`. Ollama is still used for `update_knowledge`.

## Status
Superseded

## Context
Two operations have fundamentally different characteristics:

1. **Initial generation** (`generate_knowledge_base`): Reads large amounts of source code, requires structural reasoning over the whole codebase, runs once per project.
2. **Incremental update** (`update_knowledge`): Looks at a handful of changed files, regenerates one module doc, runs frequently.

## Rationale (original)
Claude API for generation: structural reasoning over large context. Ollama for updates: fast, local, zero marginal cost.

## Why superseded
Requiring a separate Anthropic API key is friction — users running inside Claude Code already have an LLM. The correct agentic pattern is: tool handles I/O, agent handles reasoning. `generate_knowledge_base` now returns collected source text; the caller analyzes it and writes each doc via `write_knowledge_file`. `src/claude/client.ts` deleted.

## Consequences
- No API key required for any tool.
- Ollama still required for `update_knowledge` and `search_knowledge` (embedding).
- Generation quality depends on the calling agent's context window; 100KB source cap still applies.

---
module: decisions/002-dual-model-routing
updated: 2026-06-24
files: [src/scaffold/index.ts]
---

## Decision
~~Use the Claude API for initial full-codebase knowledge generation; use Ollama for incremental updates.~~

**Superseded (2026-06-24) by `decisions/008-standalone-mcp`:** all external models are removed. `generate_knowledge_base` and `update_knowledge` both return text for the calling agent (Claude Code) to reason over and write via `write_knowledge_file`. The Claude API client and Ollama are deleted.

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
- No API key and no Ollama required for any tool — the MCP is standalone (see `decisions/008`).
- Generation quality depends on the calling agent's context window; 100KB source cap still applies.

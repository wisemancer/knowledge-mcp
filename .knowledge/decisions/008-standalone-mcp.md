---
module: decisions/008-standalone-mcp
layer: derived
tier: T2
updated: 2026-06-24
files: ["src/search/engine.ts","src/mcp/tools.ts","src/types.ts","src/index.ts","src/cli/index.ts"]
---

## Decision
knowledge-mcp is a **standalone Claude Code MCP** with no external model dependency. Remove the
Claude API surface and Ollama entirely: search becomes dependency-free lexical scoring,
`update_knowledge` becomes agent-driven, and global config is removed.

## Status
Accepted

## Context
The tool runs inside Claude Code, which already provides the reasoning model. Two leftover external
dependencies contradicted that: the Claude API (`anthropic_api_key`/`claude_model`, already
superseded for generation by `decisions/002`) and Ollama (a `qwen2.5-coder` model for
`update_knowledge` generation and a separate `nomic-embed-text` model for search embeddings).
Requiring a running Ollama server and a separate embedding model is friction and dead weight for a
Claude-Code-native tool.

## Rationale
- **Search → lexical.** Knowledge bases are small (dozens to ~200 sections). In-process term scoring
  over `## ` sections returns useful results in well under 10ms with zero dependencies and no model.
  The semantic edge of embeddings does not justify a mandatory model server at this scale.
- **`update_knowledge` → agent-driven.** The correct agentic pattern (already used by
  `generate_knowledge_base`) is: the tool does I/O, the agent does reasoning. `update_knowledge`
  returns the current doc + changed-file contents + instructions; Claude rewrites and saves via
  `write_knowledge_file`. No model call in the tool.
- **Config removed.** `Config` only ever held Ollama/Claude settings. With both gone, nothing is
  configurable, so `src/config.ts`, `ConfigSchema`, and all `config` threading are deleted.

## Consequences
- Deleted: `src/ollama/`, `src/search/vector-store.ts`, `src/config.ts`, `.knowledge/.index.json`,
  and the stale module docs `claude-client.md`, `ollama-client.md`, `vector-store.md`.
- `src/types.ts` loses `ConfigSchema`/`Config`, `VectorEntry`/`VectorIndex`, the zod import, and the
  `OLLAMA_UNAVAILABLE`/`EMBED_FAILED` error codes. `SearchResult` stays.
- No API key, no Ollama, no embedding model, no vector index to keep in sync. `git clone` + global
  install is the whole setup.
- Search quality is lexical, not semantic — acceptable at KB scale; revisit only if a KB grows
  past the linear-scan comfort zone (parallels `decisions/001`).
- `update_knowledge` no longer mutates the KB by itself; it hands the rewrite to the calling agent.

---
module: architecture
updated: 2026-05-04
files: [src/index.ts, src/types.ts]
---

## Purpose
knowledge-mcp is a globally-installable MCP server and CLI tool. It maintains a `.knowledge/` directory of structured markdown files and an `AGENTS.md` file in each software project so AI agents read curated intent and decisions instead of raw source code, reducing token cost and improving plan quality. Agents also gain self-correction capability through the `verify_project` tool, which runs project-specific verification commands without human intervention.

## Decisions
- **Dual interface**: MCP server (primary, stdio transport) + CLI (secondary). Both share core modules. `src/index.ts` routes by argv: no args or `serve` → MCP mode; any other subcommand → CLI mode.
- **Dual model routing**: Claude API for initial full-codebase generation (structural, expensive, one-shot). Ollama for incremental per-module updates (fast, local, zero marginal cost). See `decisions/002-dual-model-routing.md`.
- **JSON vector store**: Embeddings persisted as `.knowledge/.index.json`. No extra services. chromadb is the named upgrade path. See `decisions/001-json-vector-store.md`.
- **Project-local knowledge**: `.knowledge/` lives in the project repo alongside source code. No central server.

## Patterns
MCP server is always invoked in stdio mode. Working directory (`process.cwd()`) determines which project's `.knowledge/` is used. Config is loaded once at startup from `~/.knowledge-mcp/config.json`.

```
MCP Client ──► MCPServer ──► ToolHandlers (tools.ts)
                                    │
               ┌────────────────────┼──────────────────────────┐
               ▼                    ▼                          ▼
         KnowledgeIO          SearchEngine                Scaffold
         (reader/writer)      (engine.ts)            (init/generate)
               │                    │                          │
         OllamaClient          VectorStore                AGENTS.md
         ClaudeClient          (.index.json)           .knowledge/
```

Project artifacts managed per-project:
- `AGENTS.md` — project root; auto-loaded by AI agents at session start
- `.knowledge/` — structured docs; read via MCP tools
- `PLAN.md` — current implementation task; written by `write_plan` tool
- `.knowledge/.index.json` — vector index; managed by search engine

## Constraints
- `process.stdout` is reserved for MCP stdio protocol. All diagnostics/logs go to `process.stderr`.
- Files writable by MCP tools: `AGENTS.md`, `PLAN.md`, any file under `.knowledge/`. Never write outside these.
- Config is global (`~/.knowledge-mcp/config.json`). Knowledge is local (project `.knowledge/`).
- MCP tools that mutate state: `write_plan`, `update_knowledge`, `init_knowledge_base`, `generate_knowledge_base`.
- MCP tools that are read-only: `read_knowledge_base`, `search_knowledge`, `verify_project`.

## Tech Stack
- TypeScript 5, Node 20, `"type": "module"` (ESM)
- `@modelcontextprotocol/sdk` — MCP server and stdio transport
- `@anthropic-ai/sdk` — Claude API
- `commander` — CLI argument parsing
- `zod` — config and tool-input validation
- Native `fetch` — Ollama HTTP calls (no extra dependency)

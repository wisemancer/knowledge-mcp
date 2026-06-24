---
module: architecture
layer: canonical
tier: T1
updated: 2026-06-24
files: [src/index.ts, src/types.ts]
---

## Purpose
knowledge-mcp is a globally-installable MCP server and CLI tool. It maintains a `.knowledge/` directory of structured markdown files and an `AGENTS.md` file in each software project so AI agents read curated intent and decisions instead of raw source code, reducing token cost and improving plan quality. Agents also gain self-correction through `verify_project` (runs project verification commands) and `verify_knowledge` (validates the KB against the standard architecture).

## Decisions
- **Standalone Claude Code MCP**: No external model. Claude Code is the only reasoner. No Anthropic API key, no Ollama, no embedding model. See `decisions/008-standalone-mcp.md`.
- **Dual interface**: MCP server (primary, stdio transport) + CLI (secondary). Both share core modules. `src/index.ts` routes by argv: no args or `serve` → MCP mode; any other subcommand → CLI mode.
- **Agent does the reasoning**: `generate_knowledge_base` and `update_knowledge` return collected text; the calling agent reasons and writes via `write_knowledge_file`. The tools do I/O, not inference.
- **Lexical search**: `search_knowledge` scores `## ` sections by term coverage in-process — no embeddings, no index file. See `decisions/001-json-vector-store.md` (superseded).
- **Standard KB architecture**: Generated KBs use canonical/derived layers, markers, citations, source tiers, and guardrails. See `decisions/007-kb-standard.md`.
- **Project-local knowledge**: `.knowledge/` lives in the project repo alongside source code. No central server.

## Patterns
MCP server is always invoked in stdio mode. Working directory (`process.cwd()`) determines which project's `.knowledge/` is used.

```
MCP Client ──► MCPServer ──► ToolHandlers (tools.ts)
                                    │
               ┌────────────────────┼──────────────────────┐
               ▼                    ▼                      ▼
         KnowledgeIO          SearchEngine             Scaffold
         (reader/writer)      (engine.ts, lexical)  (init/generate/design)
               │                    │                      │
         verify.ts            (no index, no model)     AGENTS.md + .knowledge/
         (verify_knowledge)
```

Project artifacts managed per-project:
- `AGENTS.md` — project root; auto-loaded by AI agents at session start
- `.knowledge/` — structured docs (canonical/, derived/, meta/, skills/); read via MCP tools
- `PLAN.md` — current implementation task; written by `write_plan` tool

## Constraints
- `process.stdout` is reserved for MCP stdio protocol. All diagnostics/logs go to `process.stderr`.
- Files writable by MCP tools: `AGENTS.md`, `PLAN.md`, any file under `.knowledge/`. Never write outside these.
- No external service or model dependency — the tool runs fully offline inside Claude Code.
- MCP tools that mutate state: `write_plan`, `init_knowledge_base`, `write_knowledge_file`.
- MCP tools that return text for the agent to act on: `generate_knowledge_base`, `update_knowledge`, `design_project`.
- MCP tools that are read-only: `read_knowledge_base`, `search_knowledge`, `verify_project`, `verify_knowledge`.

## Tech Stack
- TypeScript 5, Node 20, `"type": "module"` (ESM)
- `@modelcontextprotocol/sdk` — MCP server and stdio transport
- `commander` — CLI argument parsing
- No runtime model/embedding dependency; no network calls

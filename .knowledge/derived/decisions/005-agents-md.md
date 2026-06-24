---
module: decisions/005-agents-md
layer: derived
tier: T2
updated: 2026-05-04
files: [src/scaffold/index.ts, src/mcp/tools.ts]
---

## Decision
Generate `AGENTS.md` in the project root as part of `init`, and surface it automatically in `read_knowledge_base` (no-arg call) via the MCP tool handler.

## Status
Accepted

## Context
AI coding agents (Claude Code, Zed, Cursor, GitHub Copilot Workspace) auto-load files named `AGENTS.md`, `CLAUDE.md`, or `AGENTS` from the project root at session start. This gives them orientation — project purpose, build commands, key constraints — before any user message or tool call.

Without this file, an agent landing in a knowledge-mcp-managed project must call `read_knowledge_base` explicitly to get oriented, which requires prior knowledge that the tool exists. With AGENTS.md in the root, agents get baseline context for free, then call `read_knowledge_base` for depth.

Two design questions arose:
1. **Where does the file live?** Root vs inside `.knowledge/`.
2. **Where do verification commands come from?** A new config key vs reading from `conventions.md`.

## Rationale

**Root placement**: Agents auto-load from the project root, not subdirectories. Placing AGENTS.md in `.knowledge/` would make it just another knowledge file — it would not be auto-loaded. The whole point is zero-tool-call context injection.

**Verification commands from `conventions.md`**: The `## Verification` section of `conventions.md` is already the natural home for "how to check this project is correct" — that is a coding convention. Adding a separate config key (`~/.knowledge-mcp/config.json` or a new `.knowledge/config.json`) would fragment information that belongs together. The `verify_project` tool reads from `conventions.md` so there is a single source of truth.

**Auto-injection in `read_knowledge_base` (no-arg)**: When an agent calls `read_knowledge_base` with no arguments to get a full project context dump, it should also receive AGENTS.md content — even if the agent already auto-loaded the file, it may have been truncated. Injecting it here is free and ensures completeness. This belongs in the MCP tool handler (`tools.ts`), not in `reader.ts`, because AGENTS.md has no frontmatter and is not a `KnowledgeFile`.

## Consequences
- `initKnowledgeBase` grows by one file: `AGENTS.md` at the project root. Same idempotency rules apply.
- `conventions.md` gains a `## Verification` section listing shell commands. The format is a markdown bullet list of backtick-wrapped commands.
- `verify_project` parses the `## Verification` section from `conventions.md` at call time (not cached), so changes to the section take effect immediately without restarting the server.
- `read_knowledge_base` with no args becomes the "full context" call: all knowledge files + AGENTS.md. Agents should prefer this on session start.

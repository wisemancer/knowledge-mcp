# PLAN — knowledge-mcp on `feat/kb-standard`

Two workstreams on this branch.

## Workstream A — Standard Knowledge-Base Architecture  (DONE, compiling)
Implements `decisions/007-kb-standard`: canonical/derived layers, markers, citations, source
tiers, guardrails, Writer→Reviewer→Verifier. Delivered:
- `types.ts`: `Marker`, `KnowledgeLayer`, `SourceTier`, `KnowledgeFinding`, `KnowledgeVerifyReport`;
  `KnowledgeMeta` gains optional `layer`/`tier`.
- `knowledge/reader.ts`: parse optional `layer`/`tier` frontmatter.
- `knowledge/verify.ts` (new): `verifyKnowledge` — objective marker/citation/tier/staleness checks.
- `mcp/tools.ts`: new read-only `verify_knowledge` tool (10th); read output surfaces `layer`/`tier`.
- `scaffold/index.ts`: canonical/derived/meta template layout + `TEMPLATE_SOURCE_TIERS`/
  `TEMPLATE_GUARDRAILS`; `generate_knowledge_base`/`design_project` instruction text demands the standard.

## Workstream B — Standalone Claude-Code MCP (remove external models)
Implements `decisions/008-standalone-mcp`. knowledge-mcp must depend on NO external model: Claude
Code is the only reasoner. Remove the Claude API surface and Ollama entirely.

### Decisions taken
- **Search → dependency-free lexical.** Reimplement `searchKnowledge` as in-process term scoring over
  `## ` sections. Delete embeddings, the JSON vector store, and `.index.json`.
- **`update_knowledge` → agent-driven.** Return current doc + changed-file contents + instructions;
  Claude rewrites and saves via `write_knowledge_file`. No model call. (Mirrors `generate_knowledge_base`.)
- **Config removed.** It only held Ollama/Claude settings; nothing configurable remains.

### Files to delete
- `src/ollama/` (client) · `src/search/vector-store.ts` · `src/config.ts` · `.knowledge/.index.json`
- Stale docs: `.knowledge/modules/{claude-client,ollama-client,vector-store}.md`

### Files to modify
- `src/search/engine.ts` — rewrite: lexical `searchKnowledge(projectDir, query, topK)`; drop
  `rebuildIndex`, `cosineSimilarity`, embeddings, staleness, vector-store imports.
- `src/types.ts` — remove `ConfigSchema`/`Config`/zod import, `VectorEntry`/`VectorIndex`,
  error codes `OLLAMA_UNAVAILABLE`/`EMBED_FAILED`. Keep `SearchResult`.
- `src/mcp/tools.ts` — `search_knowledge` drops `config`; `update_knowledge` reworked to return text
  (no Ollama); drop `rebuildIndex` calls; `registerTools`/`executeTool` drop `config` param.
- `src/mcp/server.ts` — `startServer()` drops `config`.
- `src/index.ts` — drop `loadConfig`; route on argv only.
- `src/cli/index.ts` — `runCLI(args)` drops `config`; `update` reworked to print agent instructions;
  `search` drops `config`; drop Ollama import.
- `src/scaffold/index.ts` — remove unused `Config` import.
- Doc updates: `architecture.md` (drop ClaudeClient/Ollama from diagram + tech stack), `search.md`
  (lexical), `cli.md`, `mcp-server.md` (update_knowledge behavior), `conventions.md`, `config.md` (delete or note removal).

### Observability (Gate 3)
Unchanged policy: stderr `[knowledge-mcp]` logs on unexpected errors; errors via `KnowledgeError`
→ `{ isError: true }`. Lexical search and agent-driven update add no I/O needing new instrumentation.

### Verify
`npx tsc --noEmit` → `npm run build` → `npm install -g .` → `git rm .knowledge/.index.json` →
run `verify_knowledge` against this repo's own KB and report findings.
```
---
module: knowledge-standard
layer: meta
updated: 2026-06-24
files: ["src/scaffold/index.ts","src/mcp/tools.ts"]
---

## Purpose
Defines the **standard knowledge-base architecture** that knowledge-mcp emits and validates: the canonical/derived layering, the marker vocabulary, the source-tier table, and the guardrail catalogue. `scaffold` materializes this standard as templates (`init_knowledge_base`) and as instruction text (`generate_knowledge_base`, `design_project`); the `verify_knowledge` MCP tool enforces the mechanically-checkable parts. See `decisions/007-kb-standard` for the rationale.

## Decisions
- **Layer encoded in frontmatter and path**: `layer: canonical | derived | meta | skill` plus directory placement (`canonical/`, `derived/`, `meta/`, `skills/`). Path is the human signal; frontmatter is the machine signal `verify_knowledge` reads.
- **Tier on canonical/derived files**: `tier: T1|T2|T3|T4` set to the lowest-authority source materially contributing. Caps the strongest marker allowed in that file.
- **Marker legend shipped in every KB**: `meta/SOURCE_TIERS.md` carries the tier table and per-file assignments; `meta/GUARDRAILS.md` carries KG1–KG6. Generated agents read these, not tribal knowledge.

## Patterns
Marker vocabulary (use exactly one per claim):
```
[EXPLICIT]          verifiable in source; needs citation + tier T1/T2
[INFERRED:strong]   multiple converging signals; needs tier T2+
[INFERRED:weak]     single signal or naming only
[INFERRED]          plain form when calibration is obvious
[ASSUMED]           gap fill, no code basis
[MISSING_INFO]      not determinable from source; never invented
```
Citation forms: `path` or `path:line` (e.g. `src/mcp/tools.ts:120`). Every `[EXPLICIT]` claim must carry one.

Example canonical line:
```
- The config defaults `ollama_model` to `qwen2.5-coder:7b`. [EXPLICIT] src/types.ts:33
```
Example derived line:
```
- The JSON vector store was chosen to avoid native deps. [INFERRED:strong] (canonical/dependencies.md — no chromadb/sqlite in manifest)
```

## Constraints
- Always assign exactly one marker per factual claim; never leave a claim unmarked.
- Never emit an `[EXPLICIT]` claim without a `path` or `path:line` citation.
- Never let a marker present on a canonical claim disappear when a derived file reuses it (assumption laundering, KG2).
- Always keep canonical authoritative: a derived claim that conflicts with canonical is wrong.
- Never raise a claim above its file's tier ceiling (`[EXPLICIT]` needs T1/T2; `[INFERRED:strong]` needs T2+).

## Interfaces
This is a standard, not a code module. It is realized by:
- `src/scaffold/index.ts` — templates + generation/design instruction text
- `src/mcp/tools.ts` — `verify_knowledge` handler (objective enforcement)

## Files
- `src/scaffold/index.ts` — emits the standard
- `src/mcp/tools.ts` — validates the standard via `verify_knowledge`

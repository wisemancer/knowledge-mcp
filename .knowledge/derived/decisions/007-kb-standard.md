---
module: decisions/007-kb-standard
layer: derived
tier: T2
updated: 2026-06-24
files: ["src/scaffold/index.ts","src/mcp/tools.ts","src/types.ts"]
---

## Decision
Generated knowledge bases follow a **standard KB architecture** adapted from the wisengine engines: a **canonical/derived two-layer split**, **epistemic markers** on every claim, **mandatory citations**, **source tiering** with marker ceilings, **guardrails** (named anti-patterns), and a **Writer→Reviewer→Verifier** quality loop anchored by a new objective `verify_knowledge` MCP tool.

## Status
Accepted

## Context
knowledge-mcp generates a `.knowledge/` KB *from source code* so agents read curated intent instead of raw source. The original flat format (`architecture/conventions/modules/decisions/skills`) has a fatal gap: a reader cannot tell whether a statement is a **fact verifiable in source** or the **generator's inference**. The wisengine proposal/implementation engines solved the analogous problem for document-derived KBs with markers, citations, source tiering, guardrails, and a separated-roles quality loop. We adopt that discipline, mapped onto a code-derived KB.

## The standard

### 1. Two layers — canonical vs derived
```
.knowledge/
├── canonical/     ← FACTS extracted directly from source. [EXPLICIT] dominant.
│   ├── architecture.md   (structure & data flow as actually wired)
│   ├── interfaces.md     (exported signatures, verbatim)
│   ├── dependencies.md   (real deps from manifest + where used)
│   └── modules/<name>.md  (per-module factual doc)
├── derived/       ← ANALYSIS built on canonical. [INFERRED]/[ASSUMED] dominant.
│   ├── conventions.md    (inferred coding standards)
│   ├── decisions/<n>.md   (ADRs — inferred rationale)
│   └── observations.md   (patterns, risks, gaps)
├── skills/<name>.md  ← agent operating instructions (unchanged role)
└── meta/
    ├── SOURCE_TIERS.md   (tier table + per-file tier assignments)
    └── GUARDRAILS.md     (anti-pattern catalogue)
```
**Canonical always wins.** If a derived claim conflicts with canonical, canonical is correct and the derived file must be flagged.

### 2. Epistemic markers (every claim carries one)
- `[EXPLICIT]` — directly verifiable in source (a signature, a manifest dependency, a config default). Requires a citation. Requires source tier T1/T2.
- `[INFERRED:strong]` — deduced from multiple converging code signals. Requires T2+.
- `[INFERRED:weak]` — deduced from a single signal or from naming alone.
- `[INFERRED]` — plain form when calibration is obvious from context.
- `[ASSUMED]` — gap-filling with no code basis.
- `[MISSING_INFO]` — not determinable from source; never invented.

### 3. Citations
Every `[EXPLICIT]` claim cites `path` or `path:line` (e.g. `src/config.ts:42`). Derived claims cite the canonical entry or source they rest on. No uncited `[EXPLICIT]`.

### 4. Source tiering (authority → marker ceiling)
| Tier | What qualifies (code-derived) | Marker ceiling |
|------|-------------------------------|----------------|
| T1 | Executable source that compiles/runs; the manifest (package.json) | `[EXPLICIT]` |
| T2 | Tests, type definitions, committed schema/config | `[EXPLICIT]`/`[INFERRED:strong]` |
| T3 | Comments, docstrings, naming conventions | `[INFERRED]` only |
| T4 | README prose, commit messages, external docs | context only, never a claim |
| TX | Dead/rejected code | recorded in `meta/SOURCE_TIERS.md`, never a claim |
A canonical file's tier is the **lowest-authority** source that materially contributes to it.

### 5. Guardrails (KG1–KG6, actively checked)
| ID | Anti-pattern | Severity |
|----|--------------|----------|
| KG1 | Fabrication — KB describes a module/behavior absent from source | BLOCK |
| KG2 | Assumption laundering — a marker present in canonical is dropped in derived | BLOCK |
| KG3 | Citation gap — `[EXPLICIT]` with no `path`/`path:line` | BLOCK |
| KG4 | Marker inflation — everything `[EXPLICIT]` (avoid scrutiny) or all `[INFERRED]` (avoid commitment) | FLAG |
| KG5 | Single-source dependency — a critical architectural claim rests on one ambiguous signal | FLAG |
| KG6 | Staleness — KB cites a file/symbol that no longer exists | FLAG |

### 6. Quality loop — separated roles ("don't grade your own homework")
- **Writer** — the calling agent reasons over source text from `generate_knowledge_base` and writes each file via `write_knowledge_file`.
- **Reviewer** — same agent, instructed to re-read each file with a skeptic's eye against the guardrails before finishing (instruction-level, not a separate tool).
- **Verifier** — the new `verify_knowledge` MCP tool: objective, mechanical, pass/fail. Parallels wisengine's `validate_markers`/`validate_tiers`.

## Rationale
Markers + citations are the highest-value, lowest-friction win: they convert "plausible prose" into "auditable knowledge" and feed agent trust the way wisengine markers feed estimation risk. The canonical/derived split gives the marker discipline a structural home (facts vs analysis). Tiering bounds marker strength so inference can't masquerade as fact. Guardrails name the failure modes a reviewer checks. The Verifier is mechanical so quality does not depend on the writer grading itself.

## Consequences
- New emitted directory shape (`canonical/`, `derived/`, `meta/`). The existing recursive reader and suffix module-filter already handle subdirectories — no reader change required.
- Knowledge-file frontmatter gains `layer` and `tier` fields (see `decisions/003-knowledge-file-format`).
- `generate_knowledge_base` and `design_project` instruction text demand markers, citations, and the layer split.
- New MCP tool `verify_knowledge` (10th tool) performs objective marker/citation/tier validation.
- knowledge-mcp's own KB may be migrated to this standard later (dogfooding) — out of scope for the introducing change.

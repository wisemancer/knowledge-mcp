---
module: decisions/010-language-profiles
layer: derived
tier: T2
updated: 2026-06-24
files: ["src/scaffold/index.ts","src/types.ts","src/mcp/tools.ts","src/cli/index.ts"]
---

## Decision
Make `generate_knowledge_base` language-aware via a `PROJECT_PROFILES` map (`swift`, `node`, `go`, `rust`, `python`, `java`, `cpp`, `generic`). Each profile carries source `extensions`, `skipDirs`, `defaultSourceDirs`, and a `languageHint`. The project type is auto-detected from root marker files, with an optional explicit override (`language` param on the tool, `--lang` on the CLI). Salvaged from the abandoned `feat/initial-implementation` branch and adapted to the standalone + standard-KB design.

## Status
Accepted

## Context
`generateKnowledgeBase` used a single hardcoded extension list and noise-dir set with no language awareness, so it collected the same file types regardless of ecosystem and gave the calling agent no ecosystem context. `feat/initial-implementation` (PR #2) had a clean profile-based solution, but the rest of that branch is obsolete (it re-adds the Claude client and the pre-standard flat templates), so the branch cannot be merged — only the idea is portable.

## Rationale
- Per-language `extensions` + `skipDirs` make file discovery precise (e.g. skip `Pods`/`DerivedData` for Swift, `target` for Rust) and keep the 100KB budget focused on real source.
- The `languageHint` prepended to the returned text primes the calling agent with ecosystem patterns to look for — at zero tool cost (the agent still does all reasoning, per `decisions/002`).
- Auto-detection from root markers (`Package.swift`, `go.mod`, `Cargo.toml`, `package.json`, `pyproject.toml`, `pom.xml`, `CMakeLists.txt`, …) keeps the common case zero-config; the override handles polyglot repos.

## Consequences
- `src/types.ts` gains `ProjectType` and `ProjectProfile`.
- `src/scaffold/index.ts` gains `PROJECT_PROFILES`, `detectProjectType`, and a `languageOverride` parameter on `generateKnowledgeBase`. The returned text leads with `Language:` + hint, then the unchanged standard-KB instructions (canonical/derived, markers, citations, tiers, guardrails, `verify_knowledge`).
- `generate_knowledge_base` tool gains an optional `language` enum; the CLI `generate` gains `--lang`. Both default to auto-detect — fully backward compatible.
- No external model, no new dependency; detection is filesystem-only at the project root.

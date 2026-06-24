# PLAN — Language-aware generation (PROJECT_PROFILES)

Implements `decisions/010-language-profiles`. Branch: `feat/language-profiles` (off `main`).
Ports the profile idea from the abandoned `feat/initial-implementation`, adapted to the
standalone + standard-KB design. PR #2 stays open (untouched).

## Files to modify (topological)
1. `src/types.ts` — add:
   ```ts
   export type ProjectType = 'swift'|'node'|'go'|'rust'|'python'|'java'|'cpp'|'generic';
   export interface ProjectProfile { extensions: string[]; skipDirs: string[]; defaultSourceDirs: string[]; languageHint: string; }
   ```
2. `src/scaffold/index.ts`
   - Add `PROJECT_PROFILES: Record<ProjectType, ProjectProfile>` (8 profiles).
   - Add `export async function detectProjectType(projectDir): Promise<ProjectType>` — root-marker
     detection (Package.swift/*.xcodeproj, go.mod, Cargo.toml, package.json, pyproject/setup/requirements,
     pom/build.gradle, CMakeLists/Makefile), fallback `generic`.
   - `generateKnowledgeBase(projectDir, sourceDirs, languageOverride?: ProjectType)`:
     - `type = languageOverride ?? await detectProjectType(projectDir)`; `profile = PROJECT_PROFILES[type]`.
     - Discovery uses `profile.extensions`; pass merged skip set (`NOISE_DIRS ∪ profile.skipDirs`) to `walkDir`.
     - Prepend `Language: <type>` + `profile.languageHint`, then KEEP the current standard-KB
       instruction block (canonical/derived, markers, citations, tiers, guardrails, verify_knowledge) unchanged.
   - `walkDir(dir, skipDirs)` gains a skip-set param (prune during recursion; still skips dotdirs).
3. `src/mcp/tools.ts` — `generate_knowledge_base` schema gains optional `language` enum; handler passes
   `params.language as ProjectType | undefined` to `generateKnowledgeBase`.
4. `src/cli/index.ts` — `generate` gains `--lang <type>`; passes override through.

## Knowledge docs
- Update `canonical/modules/scaffold.md` (Interfaces: new types + `generateKnowledgeBase` signature,
  `detectProjectType`; note profile-based discovery).
- Update `canonical/modules/mcp-server.md` (generate tool gains `language`).

## Observability (Gate 3)
Unchanged policy — pure file I/O + text; detection failures fall back to `generic` (no throw),
errors still surface via `KnowledgeError` → `{ isError: true }`. No new logging/metrics needed.

## Constraints / compatibility
- Backward compatible: omitting `language`/`--lang` auto-detects; existing callers keep working.
- No new dependency; no external model; detection is root-only filesystem reads.
- All shared types in `src/types.ts`; no `any` (cast `language` at the MCP boundary).

## Verify
`tsc --noEmit` → `npm run build` → scaffold/generate smoke test (auto-detect on this repo = node;
`--lang rust` overrides) → `verify_knowledge` clean → `npm install -g .` → commit, push, PR vs main.

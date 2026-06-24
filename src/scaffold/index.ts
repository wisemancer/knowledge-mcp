import { readFile, writeFile, mkdir, access, readdir, stat } from "fs/promises";
import { constants } from "fs";
import { join, resolve, relative, dirname, extname } from "path";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function TEMPLATE_ARCHITECTURE(projectName: string): string {
  return `---
module: architecture
layer: canonical
tier: T1
updated: ${today()}
files: []
---

## Purpose
${projectName} — describe what this project does and why it exists. One paragraph covering the problem it solves and the core design intent.

> CANONICAL layer: state only facts verifiable in source. Mark every claim.
> Markers: [EXPLICIT] (a fact in source — MUST cite path or path:line, e.g. \`src/app.ts:42\`),
> [INFERRED:strong|weak] (deduced — cite the signal), [ASSUMED] (gap fill), [MISSING_INFO].
> Replace the placeholders below; once you cite real source, switch the marker to [EXPLICIT].

## Decisions
- **<key architectural choice>**: <why>. [ASSUMED]
- **<another choice>**: <rationale>. [INFERRED:weak] (naming in <where>)

## Patterns
Describe the primary data flow or request lifecycle. Cite the wiring you can see in source.

\`\`\`
ComponentA ──► ComponentB ──► ComponentC
\`\`\`

## Constraints
- Do not write to <resource> from <place>.
- Never expose <thing> outside <boundary>.

## Tech Stack
- Language/runtime — and why. [ASSUMED]
- Key framework — and why. [ASSUMED]
- Key dependencies — what each provides
`;
}

function TEMPLATE_CONVENTIONS(): string {
  return `---
module: conventions
layer: derived
tier: T2
updated: ${today()}
files: [src/**/*.ts]
---

## Purpose
Coding standards and patterns for this project. These rules apply to all source files and are non-negotiable.

## Agent Workflow
- **Knowledge-first — no code without a plan**: Before suggesting or writing any code, write or update the relevant \`.knowledge/\` files and call \`write_plan\` to produce \`PLAN.md\`. Describe intent, constraints, and interfaces before any implementation exists. This is a hard gate, not a suggestion.
- **Knowledge base only**: During planning and implementation, read \`.knowledge/\` files via \`read_knowledge_base\` and \`search_knowledge\`. Never read raw source files directly. Source files are for the compiler; \`.knowledge/\` is for agents.
- **Observability is non-negotiable**: Every feature must define its logging, tracing, and metrics coverage in \`.knowledge/\` before implementation begins. Agents must not write code for a feature that lacks defined observability.
- **Docker over local installs**: Always recommend Docker for running services, databases, and tools. Never suggest installing software directly on the host machine.

## Observability
- **Logging**: <define log levels, format (structured JSON or plain text), and what events must always be logged>
- **Tracing**: <define whether distributed tracing is required and with what library, or explicitly state "not required at current scale">
- **Metrics**: <define what counters/gauges/histograms the project emits and where they are collected>
- **Error reporting**: <define how errors surface — stderr, external service, MCP error response, etc.>

## Patterns
- **<pattern name>**: description of the pattern and rationale.
- **<naming convention>**: examples of correct usage.
- **Error handling**: describe the error strategy (throw typed errors, catch at boundaries, etc.).

## Decisions
- **<tooling choice>**: why this approach over alternatives.
- **No <X>**: reason this common approach is avoided here.

## Constraints
- Do not use...
- Never...
- Always...

## Files
\`\`\`
src/  — describe your source layout here
\`\`\`
`;
}

function TEMPLATE_MODULE(name: string): string {
  return `---
module: ${name}
layer: canonical
tier: T1
updated: ${today()}
files: []
---

## Purpose
What this module does and why it exists. One paragraph.

> CANONICAL: mark every claim. Facts copied verbatim from source (e.g. an exported signature)
> use [EXPLICIT] with a path:line citation; [INFERRED]/[ASSUMED] claims need no citation.

## Decisions
- **<choice>**: <rationale>. [INFERRED:weak] (naming in <where>)

## Patterns
How to use this module correctly. Include a short code example.

\`\`\`typescript
// Example usage
\`\`\`

## Constraints
- Do not...
- Never...
- Always...

## Interfaces
Copy exported signatures verbatim from source and cite each with a path:line (see the note above).

\`\`\`typescript
export function exampleFunction(param: string): Promise<void>
\`\`\`

## Files
- \`path/to/file.ts\` — what it does
`;
}

function TEMPLATE_DECISION(slug: string): string {
  return `---
module: decisions/${slug}
layer: derived
tier: T2
updated: ${today()}
files: []
---

## Decision
One sentence stating the decision made.

## Status
Proposed

## Context
What problem or situation prompted this decision? What forces or constraints were in play?

## Rationale
Why was this option chosen over the alternatives? Be specific about what makes it better for this context.

## Consequences
- What becomes easier as a result of this decision?
- What trade-offs or limitations were accepted?
`;
}

function TEMPLATE_SKILL(name: string): string {
  return `---
module: skills/${name}
updated: ${today()}
files: []
---

## Purpose
Instructions for the ${name} agent using this knowledge base.

## How to approach this task

1. **Read the relevant knowledge files first**: use \`read_knowledge_base\` to load architecture and the modules you will touch.
2. **Search for prior patterns**: use \`search_knowledge\` with the concept you are working on.
3. **<Step three>**: description.

## Anti-patterns
- Do not proceed without reading the constraints sections of affected modules.
- Never skip the implementation order — dependencies must exist before dependents.
- Do not read raw source files. Use \`read_knowledge_base\` and \`search_knowledge\` only. Source files are for the compiler; \`.knowledge/\` is for agents.
- Do not skip \`write_plan\`. A plan described in conversation but not written to \`PLAN.md\` is not a plan.
`;
}

function TEMPLATE_SOURCE_TIERS(): string {
  return `---
module: meta/source-tiers
layer: meta
updated: ${today()}
files: []
---

## Purpose
Source tiers rank the authority of the evidence behind a claim and cap how strong a marker may be.
A canonical/derived file's \`tier\` frontmatter is the marker ceiling for every claim in it, set by
the **lowest-authority** source that materially contributes.

## Tier table (code-derived KB)
| Tier | What qualifies | Marker ceiling |
|------|----------------|----------------|
| T1 | Executable source that compiles/runs; the manifest (package.json) | [EXPLICIT] |
| T2 | Tests, type definitions, committed schema/config | [EXPLICIT] / [INFERRED:strong] |
| T3 | Comments, docstrings, naming conventions | [INFERRED] only |
| T4 | README prose, commit messages, external docs | context only, never a claim |
| TX | Dead / rejected code | recorded here, never the basis of a claim |

## Rules
- Always set \`tier\` on every canonical and derived file.
- Never raise a claim above its file's tier: [EXPLICIT] requires T1/T2; [INFERRED:strong] requires T2+.
- Record TX (rejected/dead) material here with the reason it was excluded.

## TX (rejected) material
- <none yet>
`;
}

function TEMPLATE_GUARDRAILS(): string {
  return `---
module: meta/guardrails
layer: meta
updated: ${today()}
files: []
---

## Purpose
Named anti-patterns the Reviewer checks before finishing and the \`verify_knowledge\` tool enforces
where mechanically possible. BLOCK must be fixed before the KB is trusted; FLAG needs a human look.

## Guardrails
| ID | Anti-pattern | Severity | Checked by |
|----|--------------|----------|------------|
| KG1 | Fabrication — KB describes a module/behavior absent from source | BLOCK | citation existence (verify_knowledge) + reviewer |
| KG2 | Assumption laundering — a marker present in canonical is dropped in derived | BLOCK | reviewer (manual) |
| KG3 | Citation gap — [EXPLICIT] with no path / path:line | BLOCK | verify_knowledge |
| KG4 | Marker inflation — everything [EXPLICIT] or everything [INFERRED] | FLAG | verify_knowledge |
| KG5 | Single-source dependency — a critical claim rests on one ambiguous signal | FLAG | reviewer (manual) |
| KG6 | Staleness — KB cites a file/symbol that no longer exists | FLAG | verify_knowledge |

## How to use
Writer writes → Reviewer re-reads each file against this table → Verifier (\`verify_knowledge\`) runs
the mechanical checks. Do not skip the Reviewer pass for KG2/KG5 — they are not auto-detected.
`;
}

function TEMPLATE_CLAUDE_MD(projectName: string): string {
  return `# ${projectName} — Claude Code Instructions

## HARD GATES (non-negotiable, every session)

### Gate 1: Plan before code
**Never write or modify source code without a written plan in \`PLAN.md\`.**

Before any implementation:
1. Call \`read_knowledge_base\` (no filter) to load the full knowledge base.
2. Update \`.knowledge/\` files to reflect design intent via \`write_knowledge_file\`.
3. Call \`write_plan\` to produce \`PLAN.md\`.

A plan described in conversation but not written via \`write_plan\` is **not a plan**. Do not proceed to code until \`PLAN.md\` exists.

### Gate 2: Knowledge tools only — never read raw source
During planning and exploration use only:
- \`read_knowledge_base\` — read architecture, modules, decisions
- \`search_knowledge\` — search across the knowledge base

Never use \`Read\`, \`cat\`, or any direct file read on source files. Source is for the compiler; \`.knowledge/\` is for agents.

### Gate 3: Observability before coding
Every feature must have logging, tracing, and metrics defined in \`.knowledge/conventions.md ## Observability\` before coding starts.

### Gate 4: Docker for all services
Always recommend Docker for services, databases, and tools. Never suggest host-level installs.

## Build & Verify
- \`<add build command>\`
- \`<add verify command>\`
`;
}

function TEMPLATE_AGENTS_MD(projectName: string): string {
  return `# ${projectName}

## Workflow Rule
**Never write code without a plan.** Before any implementation:
1. Call \`read_knowledge_base\` with no arguments to load the full knowledge base.
2. Update \`.knowledge/\` files to reflect the design intent via \`write_knowledge_file\`.
3. Call \`write_plan\` to record the implementation plan in \`PLAN.md\`.
Only then write code — in the order defined in \`PLAN.md\`.

## Knowledge Standard
The KB is split into \`canonical/\` (facts verifiable in source) and \`derived/\` (analysis built on them); \`meta/\` holds the source-tier table and guardrails. Every claim carries a marker — [EXPLICIT] (cite \`path\`/\`path:line\`), [INFERRED:strong|weak], [ASSUMED], [MISSING_INFO] — and canonical always wins on conflict. After writing knowledge files, run \`verify_knowledge\`.

## Observability Gate
Every feature must have logging, tracing, and metrics defined in \`.knowledge/conventions.md ## Observability\` before coding starts.

## Environment Rule
Always use Docker for services, databases, and tools — never install software directly on the host.

## Build & Verify
- \`<add build command>\`
- \`<add verify command>\`

## Purpose
<fill in project purpose — see .knowledge/architecture.md>

## Key Constraints
- <fill in from .knowledge/architecture.md ## Constraints>
- <fill in from .knowledge/conventions.md ## Constraints>
`;
}

const INIT_FILES: { path: string; content: string }[] = [
  { path: "canonical/architecture.md", content: TEMPLATE_ARCHITECTURE("project") },
  { path: "canonical/modules/example.md", content: TEMPLATE_MODULE("example") },
  { path: "derived/conventions.md", content: TEMPLATE_CONVENTIONS() },
  {
    path: "derived/decisions/001-example.md",
    content: TEMPLATE_DECISION("001-example"),
  },
  { path: "meta/SOURCE_TIERS.md", content: TEMPLATE_SOURCE_TIERS() },
  { path: "meta/GUARDRAILS.md", content: TEMPLATE_GUARDRAILS() },
  { path: "skills/planning.md", content: TEMPLATE_SKILL("planning") },
  { path: "skills/coding.md", content: TEMPLATE_SKILL("coding") },
  { path: "skills/updater.md", content: TEMPLATE_SKILL("updater") },
];

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function initKnowledgeBase(
  projectDir: string,
  projectName?: string,
): Promise<void> {
  const kDir = join(resolve(projectDir), ".knowledge");
  const name = projectName ?? "project";

  // AGENTS.md and CLAUDE.md go to project root directly, not inside .knowledge/
  await mkdir(resolve(projectDir), { recursive: true });
  const agentsPath = join(resolve(projectDir), "AGENTS.md");
  if (!(await exists(agentsPath))) {
    await writeFile(agentsPath, TEMPLATE_AGENTS_MD(name), "utf-8");
  }
  const claudePath = join(resolve(projectDir), "CLAUDE.md");
  if (!(await exists(claudePath))) {
    await writeFile(claudePath, TEMPLATE_CLAUDE_MD(name), "utf-8");
  }

  const filesToWrite: { path: string; content: string }[] = [
    { path: "canonical/architecture.md", content: TEMPLATE_ARCHITECTURE(name) },
    ...INIT_FILES.slice(1),
  ];

  for (const file of filesToWrite) {
    const fullPath = join(kDir, file.path);
    if (await exists(fullPath)) continue;
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, file.content, "utf-8");
  }
}

export async function generateKnowledgeBase(
  projectDir: string,
  sourceDirs: string[],
): Promise<string> {
  // Collect source files up to 100KB total
  let totalBytes = 0;
  const MAX_BYTES = 100 * 1024;
  const sourceFiles: { path: string; content: string }[] = [];

  for (const dir of sourceDirs) {
    const fullDir = resolve(dir);
    const entries = await walkDir(fullDir);
    for (const entry of entries) {
      if (totalBytes >= MAX_BYTES) break;
      const ext = extname(entry);
      if (
        ![
          ".ts",
          ".tsx",
          ".js",
          ".jsx",
          ".json",
          ".yaml",
          ".yml",
          ".toml",
          ".md",
          ".html",
          ".css",
        ].includes(ext)
      )
        continue;
      const content = await readFile(entry, "utf-8");
      const size = Buffer.byteLength(content, "utf-8");
      if (totalBytes + size > MAX_BYTES) break;
      totalBytes += size;
      sourceFiles.push({ path: relative(projectDir, entry), content });
    }
    if (totalBytes >= MAX_BYTES) break;
  }

  // Format collected files as text for the caller (Claude Code) to analyze
  const lines: string[] = [];
  for (const f of sourceFiles) {
    lines.push(`=== ${f.path} ===\n${f.content}\n=== end ===`);
  }
  lines.push("\n---");
  lines.push(
    "Analyze the files above and call write_knowledge_file for each doc. Produce the STANDARD knowledge base:",
  );
  lines.push("");
  lines.push(
    "1. SPLIT BY LAYER. Facts verifiable in source go in canonical/ (canonical/architecture.md, canonical/modules/<name>.md). Analysis built on those facts — conventions, design rationale, observations — goes in derived/ (derived/conventions.md, derived/decisions/<n>.md). Canonical always wins on conflict.",
  );
  lines.push(
    "2. MARK EVERY CLAIM with exactly one marker: [EXPLICIT] | [INFERRED:strong] | [INFERRED:weak] | [INFERRED] | [ASSUMED] | [MISSING_INFO]. Never leave a factual claim unmarked.",
  );
  lines.push(
    "3. CITE EVERY [EXPLICIT] with a path or path:line (e.g. src/config.ts:42). No uncited [EXPLICIT].",
  );
  lines.push(
    "4. RESPECT TIER CEILINGS (set `tier:` per file; see meta/SOURCE_TIERS.md): [EXPLICIT] needs T1/T2; [INFERRED:strong] needs T2+.",
  );
  lines.push(
    "5. SELF-REVIEW each file against meta/GUARDRAILS.md (KG1-KG6) before finishing — you are the Reviewer, not just the Writer.",
  );
  lines.push(
    "6. THEN call verify_knowledge and fix every BLOCK it reports.",
  );
  lines.push("");
  lines.push(`Frontmatter for each file (updated: ${today()}):`);
  lines.push(
    "---\nmodule: <name>\nlayer: canonical|derived|meta\ntier: T1|T2|T3|T4\nupdated: <YYYY-MM-DD>\nfiles: [<globs>]\n---",
  );

  return lines.join("\n");
}

export function designProject(idea: string): string {
  const title = idea.trim().split(/\n/)[0].slice(0, 120);
  return `## design_project: ${title}

### Inferred from your idea
- Purpose: ${idea.trim()}

### Required gaps — resolve ALL of these before writing any knowledge file

[GAP: Observability] NON-NEGOTIABLE
Every project must define its observability strategy before implementation begins.
- Logging: which events must always be logged, format (structured JSON or plain text), destination (stderr, file, external service)
- Tracing: is distributed tracing required? if yes, which library
- Metrics: which counters/gauges/histograms the project emits and where they are collected
- Error reporting: how errors surface to operators (stderr, external service, structured response, etc.)

[GAP: Tech stack]
- Language / runtime — and why
- Key framework(s) — and why chosen over alternatives
- Key dependencies — what each one provides

[GAP: Constraints]
- What must never happen in this system?
- What boundaries must never be crossed (e.g. never write to X from Y, never expose Z outside W)?

[GAP: Error handling contract]
- How are errors typed and thrown from library code?
- Where are they caught?
- How do they surface to end users or callers?

---
### Instructions for Claude
Ask the user about each [GAP] above in order. Do not skip Observability — it is non-negotiable.

This project uses the STANDARD knowledge base: canonical/ (facts verifiable in source) vs
derived/ (analysis built on them), every claim carries a marker ([EXPLICIT] with a path/path:line
citation, [INFERRED:strong|weak], [ASSUMED], [MISSING_INFO]), and each file declares a layer + tier.
For a greenfield project most claims are design intent — mark them [ASSUMED] or [INFERRED] until
source exists to make them [EXPLICIT].

Once all gaps are resolved, execute this sequence exactly:
1. Call init_knowledge_base(project_name: "<name inferred from idea>") to scaffold the canonical/derived/meta layout, AGENTS.md, and meta/SOURCE_TIERS.md + meta/GUARDRAILS.md
2. Call write_knowledge_file("canonical/architecture.md", <filled content with layer/tier + markers>)
3. Call write_knowledge_file("derived/conventions.md", <filled content, must include ## Observability section>)
4. Call verify_knowledge and fix every BLOCK
5. Call write_plan(<implementation plan for the first milestone>)
Do not write any code until write_plan has been called and PLAN.md exists.
`;
}

const NOISE_DIRS = new Set([
  "node_modules", "dist", "build", "__pycache__", ".venv", "coverage", ".next", "out",
]);

async function walkDir(dir: string): Promise<string[]> {
  const results: string[] = [];
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return results;
  }
  for (const entry of entries) {
    if (entry.startsWith(".") || NOISE_DIRS.has(entry)) continue;
    const fullPath = join(dir, entry);
    const s = await stat(fullPath);
    if (s.isDirectory()) results.push(...(await walkDir(fullPath)));
    else results.push(fullPath);
  }
  return results;
}

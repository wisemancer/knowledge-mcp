import { readFile, writeFile, mkdir, access, readdir, stat } from "fs/promises";
import { constants } from "fs";
import { join, resolve, relative, dirname, extname } from "path";
import { type Config } from "../types.js";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function TEMPLATE_ARCHITECTURE(projectName: string): string {
  return `---
module: architecture
updated: ${today()}
files: []
---

## Purpose
${projectName} — describe what this project does and why it exists. One paragraph covering the problem it solves and the core design intent.

## Decisions
- **<key architectural choice>**: <why this approach>. Alternatives considered: <what was rejected and why>.
- **<another choice>**: <rationale>. Alternatives considered: <rejected options>.

## Patterns
Describe the primary data flow or request lifecycle at a high level. How do the major components interact?

\`\`\`
ComponentA ──► ComponentB ──► ComponentC
\`\`\`

## Constraints
- Do not write to <resource> from <place>.
- Never expose <thing> outside <boundary>.

## Tech Stack
- Language/runtime — why
- Key framework — why
- Key dependencies — what each provides
`;
}

function TEMPLATE_CONVENTIONS(): string {
  return `---
module: conventions
updated: ${today()}
files: [src/**/*.ts]
---

## Purpose
Coding standards and patterns for this project. These rules apply to all source files and are non-negotiable.

## Agent Workflow
- **Knowledge-first — no code without a plan**: Before suggesting or writing any code, write or update the relevant \`.knowledge/\` files and call \`write_plan\` to produce \`PLAN.md\`. Describe intent, constraints, and interfaces before any implementation exists. This is a hard gate, not a suggestion.
- **Knowledge base only**: During planning and implementation, read \`.knowledge/\` files via \`read_knowledge_base\` and \`search_knowledge\`. Never read raw source files directly. Source files are for the compiler; \`.knowledge/\` is for agents.
- **Observability is non-negotiable**: Every feature must define its logging, tracing, and metrics coverage in \`.knowledge/\` before implementation begins. Agents must not write code for a feature that lacks defined observability.

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
updated: ${today()}
files: []
---

## Purpose
What this module does and why it exists. One paragraph.

## Decisions
- **<choice>**: <rationale>. Alternatives considered: <rejected options>.

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
\`\`\`typescript
// Key exported functions and types
export function exampleFunction(param: string): Promise<void>
\`\`\`

## Files
- \`path/to/file.ts\` — what it does
`;
}

function TEMPLATE_DECISION(slug: string): string {
  return `---
module: decisions/${slug}
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

function TEMPLATE_AGENTS_MD(projectName: string): string {
  return `# ${projectName}

## Workflow Rule
**Never write code without a plan.** Before any implementation:
1. Call \`read_knowledge_base\` with no arguments to load the full knowledge base.
2. Update \`.knowledge/\` files to reflect the design intent via \`write_knowledge_file\`.
3. Call \`write_plan\` to record the implementation plan in \`PLAN.md\`.
Only then write code — in the order defined in \`PLAN.md\`.

## Observability Gate
Every feature must have logging, tracing, and metrics defined in \`.knowledge/conventions.md ## Observability\` before coding starts.

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
  { path: "architecture.md", content: TEMPLATE_ARCHITECTURE("project") },
  { path: "conventions.md", content: TEMPLATE_CONVENTIONS() },
  { path: "modules/example.md", content: TEMPLATE_MODULE("example") },
  {
    path: "decisions/001-example.md",
    content: TEMPLATE_DECISION("001-example"),
  },
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

  // AGENTS.md goes to project root directly, not inside .knowledge/
  await mkdir(resolve(projectDir), { recursive: true });
  const agentsPath = join(resolve(projectDir), "AGENTS.md");
  if (!(await exists(agentsPath))) {
    await writeFile(agentsPath, TEMPLATE_AGENTS_MD(name), "utf-8");
  }

  const filesToWrite: { path: string; content: string }[] = [
    { path: "architecture.md", content: TEMPLATE_ARCHITECTURE(name) },
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
    "Analyze the files above and call write_knowledge_file for each doc you generate.",
  );
  lines.push(`Each knowledge file needs frontmatter (updated: ${today()}):`);
  lines.push("---\nmodule: <name>\nupdated: <YYYY-MM-DD>\nfiles: [<globs>]\n---");

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
Once all gaps are resolved, execute this sequence exactly:
1. Call write_knowledge_file("architecture.md", <fully filled content>)
2. Call write_knowledge_file("conventions.md", <fully filled content, must include ## Observability section>)
3. Call init_knowledge_base(project_name: "<name inferred from idea>") to scaffold remaining templates and AGENTS.md
4. Call write_plan(<implementation plan for the first milestone>)
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

import { readFile, writeFile, mkdir, access, readdir, stat } from 'fs/promises';
import { constants } from 'fs';
import { join, resolve, relative, dirname, extname } from 'path';
import { type Config } from '../types.js';
import { writeKnowledgeFile } from '../knowledge/writer.js';
import { createClaudeClient } from '../claude/client.js';
import { rebuildIndex } from '../search/engine.js';

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
`;
}

const INIT_FILES: { path: string; content: string }[] = [
  { path: 'architecture.md', content: TEMPLATE_ARCHITECTURE('project') },
  { path: 'conventions.md', content: TEMPLATE_CONVENTIONS() },
  { path: 'modules/example.md', content: TEMPLATE_MODULE('example') },
  { path: 'decisions/001-example.md', content: TEMPLATE_DECISION('001-example') },
  { path: 'skills/planning.md', content: TEMPLATE_SKILL('planning') },
  { path: 'skills/coding.md', content: TEMPLATE_SKILL('coding') },
  { path: 'skills/updater.md', content: TEMPLATE_SKILL('updater') },
];

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function initKnowledgeBase(projectDir: string, projectName?: string): Promise<void> {
  const kDir = join(resolve(projectDir), '.knowledge');
  const archContent = projectName ? TEMPLATE_ARCHITECTURE(projectName) : TEMPLATE_ARCHITECTURE('project');

  const filesToWrite: { path: string; content: string }[] = [
    { path: 'architecture.md', content: archContent },
    ...INIT_FILES.slice(1),
  ];

  for (const file of filesToWrite) {
    const fullPath = join(kDir, file.path);
    if (await exists(fullPath)) continue;
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, file.content, 'utf-8');
  }
}

export async function generateKnowledgeBase(
  projectDir: string,
  config: Config,
  sourceDirs: string[],
): Promise<void> {
  const claude = createClaudeClient(config);

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
      if (!['.ts', '.tsx', '.js', '.jsx', '.json', '.yaml', '.yml', '.toml', '.md', '.html', '.css'].includes(ext)) continue;
      const content = await readFile(entry, 'utf-8');
      const size = Buffer.byteLength(content, 'utf-8');
      if (totalBytes + size > MAX_BYTES) break;
      totalBytes += size;
      sourceFiles.push({ path: relative(projectDir, entry), content });
    }
    if (totalBytes >= MAX_BYTES) break;
  }

  // Build prompt for Claude
  const prompt = `You are a knowledge base generator. Your task is to analyze the source code files provided and generate comprehensive knowledge base documentation.

The source code files are:
${sourceFiles.map(f => `=== ${f.path} ===
${f.content}
=== end ===`).join('\n\n')}

For each important module, architecture decision, convention, or pattern you find, generate a knowledge base file following this format:

=== path/within/.knowledge/ ===
<markdown content with frontmatter>
=== end ===

Each knowledge file should start with frontmatter:
---
module: <module-name>
updated: <today's date YYYY-MM-DD>
files: [<globs or files this knowledge describes>]
---

<markdown body>

Generate files for:
1. Architecture overview
2. Coding conventions and patterns
3. Each major module or component
4. Important design decisions
5. Skills or usage guides if applicable

Be thorough but concise. Focus on what matters for future development.
`;

  const systemPrompt = `You are a knowledge base generator. Output files in the format:

=== path/within/.knowledge/ ===
<markdown content with frontmatter>
=== end ===

Always include frontmatter with module, updated, and files fields.`;

  const response = await claude.generate(prompt, systemPrompt);

  // Parse response to extract knowledge files
  const fileRegex = /===\s*(.+?)\s*===\s*\n([\s\S]*?)\n\s*===\s*end\s*===/g;
  let match: RegExpExecArray | null;

  while ((match = fileRegex.exec(response)) !== null) {
    const path = match[1];
    const content = match[2];
    await writeKnowledgeFile(projectDir, path, content);
  }

  // Rebuild the vector index
  await rebuildIndex(projectDir, config);
}

async function walkDir(dir: string): Promise<string[]> {
  const results: string[] = [];
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return results;
  }
  for (const entry of entries) {
    if (entry.startsWith('.')) continue;
    const fullPath = join(dir, entry);
    const s = await stat(fullPath);
    if (s.isDirectory()) results.push(...await walkDir(fullPath));
    else results.push(fullPath);
  }
  return results;
}

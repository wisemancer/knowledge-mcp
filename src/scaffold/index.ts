import { readFile, writeFile, mkdir, access, readdir, stat } from 'fs/promises';
import { join, resolve, relative, extname, dirname } from 'path';
import { type Config } from '../types.js';
import { createClaudeClient } from '../claude/client.js';
import { writeKnowledgeFile } from '../knowledge/writer.js';
import { readKnowledgeBase } from '../knowledge/reader.js';
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

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function initKnowledgeBase(projectDir: string, projectName?: string): Promise<void> {
  const templates: Array<[string, string]> = [
    ['architecture.md', TEMPLATE_ARCHITECTURE(projectName ?? 'project')],
    ['conventions.md', TEMPLATE_CONVENTIONS()],
    ['modules/example.md', TEMPLATE_MODULE('example')],
    ['decisions/001-example.md', TEMPLATE_DECISION('001-example')],
    ['skills/planning.md', TEMPLATE_SKILL('planning')],
    ['skills/coding.md', TEMPLATE_SKILL('coding')],
    ['skills/updater.md', TEMPLATE_SKILL('updater')],
  ];

  for (const [relativePath, content] of templates) {
    const fullPath = join(resolve(projectDir), '.knowledge', relativePath);
    if (!(await fileExists(fullPath))) {
      await writeKnowledgeFile(projectDir, relativePath, content);
    }
  }
}

async function collectSourceFiles(dirs: string[], maxBytes: number = 100_000): Promise<Array<{ path: string; content: string }>> {
  const results: Array<{ path: string; content: string }> = [];
  let totalBytes = 0;

  async function walk(dir: string): Promise<void> {
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      return;
    }

    for (const entry of entries) {
      if (totalBytes >= maxBytes) return;
      if (entry.startsWith('.') || entry === 'node_modules' || entry === 'dist') continue;

      const full = join(dir, entry);
      const s = await stat(full);
      if (s.isDirectory()) {
        await walk(full);
      } else {
        const ext = extname(full);
        if (['.ts', '.js', '.tsx', '.jsx', '.py', '.java', '.go', '.rs', '.cpp', '.c', '.h'].includes(ext)) {
          try {
            const content = await readFile(full, 'utf-8');
            totalBytes += content.length;
            if (totalBytes <= maxBytes) {
              results.push({ path: full, content });
            }
          } catch {
            // skip unreadable files
          }
        }
      }
    }
  }

  for (const dir of dirs) {
    const full = resolve(dir);
    await walk(full);
  }

  return results;
}

export async function generateKnowledgeBase(projectDir: string, sourceDirs: string[], config: Config): Promise<void> {
  const claude = createClaudeClient(config);
  const sourceFiles = await collectSourceFiles(sourceDirs);

  if (!claude) {
    process.stderr.write('⚠️  No anthropic_api_key configured. To generate knowledge base:\n');
    process.stderr.write('1. Run: knowledge-mcp read <source files>\n');
    process.stderr.write('2. Paste the output to Claude\n');
    process.stderr.write('3. Ask Claude to generate knowledge base files\n');
    process.stderr.write('4. Copy the output back to .knowledge/ directory\n\n');
    process.stderr.write('Alternatively, set anthropic_api_key in ~/.knowledge-mcp/config.json\n');
    return;
  }

  const sourceText = sourceFiles.map(f => `=== ${relative(projectDir, f.path)} ===\n${f.content}`).join('\n\n');

  const prompt = `You are an expert code documentation AI. Analyze the following source code and generate a knowledge base structure for the project.

Create documentation files in the format:
=== path/within/.knowledge/ ===
<file content with frontmatter>
=== end ===

Generate at least these files:
- architecture.md (project overview and design decisions)
- conventions.md (coding standards)
- modules/main-modules.md (key modules and their purpose)
- skills/coding.md (instructions for coding agents)

Each file should have YAML frontmatter with: module, updated (YYYY-MM-DD), files (list).

Source code to analyze:
${sourceText}`;

  const systemPrompt = `You are a technical documentation expert. Generate clear, concise documentation that will help AI agents understand the codebase structure, key decisions, and conventions.`;

  const response = await claude.generate(prompt, systemPrompt);

  const fileMatches = response.matchAll(/=== (.+?) ===\n([\s\S]*?)(?===|$)/g);
  for (const match of fileMatches) {
    const [, path, content] = match;
    if (path && content && !path.includes('end')) {
      await writeKnowledgeFile(projectDir, path.trim(), content.trim());
    }
  }

  await rebuildIndex(projectDir, config);
}

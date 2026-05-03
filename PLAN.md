# Implementation Plan: knowledge-mcp

Before writing code, read:
- `.knowledge/architecture.md` — system shape, data flow, tech stack
- `.knowledge/conventions.md` — ESM imports, error handling, no stdout, no `any`
- `.knowledge/skills/coding.md` — implementation rules

---

## Build Configuration

### `package.json`
```json
{
  "name": "knowledge-mcp",
  "version": "0.1.0",
  "description": "MCP server and CLI for project knowledge bases",
  "type": "module",
  "bin": {
    "knowledge-mcp": "./dist/index.js"
  },
  "scripts": {
    "build": "tsc && chmod +x dist/index.js",
    "dev": "tsc --watch",
    "typecheck": "tsc --noEmit"
  },
  "files": ["dist", "README.md"],
  "dependencies": {
    "@anthropic-ai/sdk": "^0.39.0",
    "@modelcontextprotocol/sdk": "^1.12.0",
    "commander": "^12.0.0",
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.4.0"
  }
}
```

### `tsconfig.json`
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "rootDir": "src",
    "outDir": "dist",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src/**/*"]
}
```

---

## File Inventory

```
src/
  index.ts                  shebang + entrypoint; routes serve vs CLI
  types.ts                  all shared interfaces, error class, ConfigSchema
  config.ts                 loadConfig from ~/.knowledge-mcp/config.json
  mcp/
    server.ts               MCP Server + StdioServerTransport startup
    tools.ts                registerTools: all 6 tool handler branches
  knowledge/
    reader.ts               readKnowledgeBase, parseKnowledgeFile, dir walker
    writer.ts               writeKnowledgeFile, formatKnowledgeFile
  search/
    engine.ts               searchKnowledge, rebuildIndex, cosineSimilarity
    vector-store.ts         loadIndex, saveIndex, upsertEntries
  ollama/
    client.ts               createOllamaClient: embed + generate via fetch
  claude/
    client.ts               createClaudeClient: messages.create wrapper
  scaffold/
    index.ts                initKnowledgeBase, generateKnowledgeBase
  cli/
    index.ts                commander program + command handlers
```

---

## Implementation Order

Implement files in this exact sequence. Run `npx tsc --noEmit` after each file.

---

### Step 1 — `src/types.ts`

All shared types. No logic, only declarations.

```typescript
import { z } from 'zod';

export const ConfigSchema = z.object({
  ollama_host: z.string().default('http://localhost:11434'),
  ollama_model: z.string().default('qwen2.5-coder:7b'),
  embed_model: z.string().default('nomic-embed-text'),
  anthropic_api_key: z.string().optional(),
  claude_model: z.string().default('claude-sonnet-4-6'),
});
export type Config = z.infer<typeof ConfigSchema>;

export interface KnowledgeMeta {
  module: string;
  updated: string;
  files: string[];
}

export interface KnowledgeFile extends KnowledgeMeta {
  content: string;  // markdown body after frontmatter stripped
  path: string;     // absolute filesystem path
}

export interface VectorEntry {
  id: string;       // "${module}::${sectionHeading}"
  module: string;
  section: string;
  text: string;     // stripped plain text (no markdown syntax)
  embedding: number[];
}

export interface VectorIndex {
  version: 1;
  entries: VectorEntry[];
}

export interface SearchResult {
  module: string;
  section: string;
  text: string;
  score: number;    // cosine similarity in [0, 1]
}

export type ErrorCode =
  | 'CONFIG_NOT_FOUND'
  | 'KNOWLEDGE_DIR_NOT_FOUND'
  | 'MODULE_NOT_FOUND'
  | 'OLLAMA_UNAVAILABLE'
  | 'CLAUDE_UNAVAILABLE'
  | 'EMBED_FAILED'
  | 'INVALID_INPUT';

export class KnowledgeError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'KnowledgeError';
  }
}
```

---

### Step 2 — `src/config.ts`

```typescript
import { readFile } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';
import { ConfigSchema, type Config } from './types.js';

export function getConfigPath(): string {
  return process.env['KNOWLEDGE_MCP_CONFIG'] ?? join(homedir(), '.knowledge-mcp', 'config.json');
}

export async function loadConfig(): Promise<Config> {
  try {
    const raw = await readFile(getConfigPath(), 'utf-8');
    return ConfigSchema.parse(JSON.parse(raw));
  } catch {
    // Missing file or invalid JSON — return defaults
    return ConfigSchema.parse({});
  }
}
```

---

### Step 3 — `src/ollama/client.ts`

Uses native `fetch`. No Ollama SDK. See `.knowledge/modules/ollama-client.md`.

```typescript
import { KnowledgeError, type Config } from '../types.js';

export interface OllamaClient {
  embed(text: string): Promise<number[]>;
  generate(prompt: string): Promise<string>;
}

export function createOllamaClient(config: Config): OllamaClient {
  const base = config.ollama_host.replace(/\/$/, '');

  async function post(path: string, body: unknown, timeoutMs: number): Promise<unknown> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(`${base}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      return res.json();
    } catch (e) {
      throw new KnowledgeError('OLLAMA_UNAVAILABLE', `Ollama request to ${path} failed: ${e}`);
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async embed(text: string): Promise<number[]> {
      const data = await post('/api/embeddings', { model: config.embed_model, prompt: text }, 30_000);
      return (data as { embedding: number[] }).embedding;
    },
    async generate(prompt: string): Promise<string> {
      const data = await post('/api/generate', { model: config.ollama_model, prompt, stream: false }, 120_000);
      return (data as { response: string }).response;
    },
  };
}
```

---

### Step 4 — `src/claude/client.ts`

See `.knowledge/modules/claude-client.md`.

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { KnowledgeError, type Config } from '../types.js';

export interface ClaudeClient {
  generate(prompt: string, systemPrompt?: string): Promise<string>;
}

export function createClaudeClient(config: Config): ClaudeClient {
  if (!config.anthropic_api_key) {
    throw new KnowledgeError('CLAUDE_UNAVAILABLE', 'anthropic_api_key is not configured in ~/.knowledge-mcp/config.json');
  }
  const client = new Anthropic({ apiKey: config.anthropic_api_key });

  return {
    async generate(prompt: string, systemPrompt?: string): Promise<string> {
      const msg = await client.messages.create({
        model: config.claude_model,
        max_tokens: 8192,
        ...(systemPrompt ? { system: systemPrompt } : {}),
        messages: [{ role: 'user', content: prompt }],
      });
      const block = msg.content[0];
      if (!block || block.type !== 'text') {
        throw new KnowledgeError('CLAUDE_UNAVAILABLE', 'Unexpected response type from Claude');
      }
      return block.text;
    },
  };
}
```

---

### Step 5 — `src/knowledge/reader.ts`

See `.knowledge/modules/knowledge-io.md`.

```typescript
import { readFile, readdir, stat } from 'fs/promises';
import { join, resolve } from 'path';
import { type KnowledgeFile } from '../types.js';

export function parseKnowledgeFile(raw: string, filePath: string): KnowledgeFile {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { module: '', updated: '', files: [], content: raw.trim(), path: filePath };

  const [, fm, body] = match;
  const get = (key: string) => fm.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))?.[1]?.trim() ?? '';
  const filesRaw = fm.match(/^files:\s*\[([^\]]*)\]$/m)?.[1] ?? '';
  const files = filesRaw
    ? filesRaw.split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
    : [];

  return {
    module: get('module'),
    updated: get('updated'),
    files,
    content: body.trim(),
    path: filePath,
  };
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
    if (entry === '.index.json' || entry.startsWith('.index.json.')) continue;
    const full = join(dir, entry);
    const s = await stat(full);
    if (s.isDirectory()) results.push(...await walkDir(full));
    else if (entry.endsWith('.md')) results.push(full);
  }
  return results;
}

export async function readKnowledgeBase(projectDir: string, module?: string): Promise<KnowledgeFile[]> {
  const kDir = join(resolve(projectDir), '.knowledge');
  const paths = await walkDir(kDir);
  const files = await Promise.all(
    paths.map(async p => parseKnowledgeFile(await readFile(p, 'utf-8'), p))
  );
  if (!module) return files;
  return files.filter(f => f.module === module || f.module.endsWith(`/${module}`));
}
```

---

### Step 6 — `src/knowledge/writer.ts`

```typescript
import { mkdir, writeFile } from 'fs/promises';
import { dirname, join, resolve } from 'path';
import { type KnowledgeMeta } from '../types.js';

export function formatKnowledgeFile(meta: KnowledgeMeta, body: string): string {
  const filesStr = `[${meta.files.map(f => `"${f}"`).join(', ')}]`;
  return `---\nmodule: ${meta.module}\nupdated: ${meta.updated}\nfiles: ${filesStr}\n---\n\n${body.trim()}\n`;
}

export async function writeKnowledgeFile(projectDir: string, relativePath: string, content: string): Promise<void> {
  const fullPath = join(resolve(projectDir), '.knowledge', relativePath);
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, content, 'utf-8');
}
```

---

### Step 7 — `src/search/vector-store.ts`

See `.knowledge/modules/vector-store.md`.

```typescript
import { readFile, writeFile, rename } from 'fs/promises';
import { join, resolve } from 'path';
import { type VectorEntry, type VectorIndex } from '../types.js';

const INDEX_FILENAME = '.index.json';

function indexPath(projectDir: string): string {
  return join(resolve(projectDir), '.knowledge', INDEX_FILENAME);
}

export async function loadIndex(projectDir: string): Promise<VectorIndex> {
  try {
    const raw = await readFile(indexPath(projectDir), 'utf-8');
    return JSON.parse(raw) as VectorIndex;
  } catch {
    return { version: 1, entries: [] };
  }
}

export async function saveIndex(projectDir: string, index: VectorIndex): Promise<void> {
  const path = indexPath(projectDir);
  const tmp = path + '.tmp';
  await writeFile(tmp, JSON.stringify(index, null, 2), 'utf-8');
  await rename(tmp, path);
}

export function upsertEntries(index: VectorIndex, entries: VectorEntry[]): VectorIndex {
  const map = new Map(index.entries.map(e => [e.id, e]));
  for (const entry of entries) map.set(entry.id, entry);
  return { version: 1, entries: Array.from(map.values()) };
}
```

---

### Step 8 — `src/search/engine.ts`

See `.knowledge/modules/search.md`.

```typescript
import { stat } from 'fs/promises';
import { join, resolve } from 'path';
import { type Config, type SearchResult, type VectorEntry } from '../types.js';
import { readKnowledgeBase } from '../knowledge/reader.js';
import { createOllamaClient } from '../ollama/client.js';
import { loadIndex, saveIndex, upsertEntries } from './vector-store.js';

function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]+`/g, ' ')
    .replace(/[#*_~>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function chunkFile(file: { module: string; content: string }): Array<{ module: string; section: string; text: string }> {
  // Split on ## headings (keep heading in chunk)
  const parts = file.content.split(/(?=^## )/m);
  return parts
    .map(part => {
      const headingMatch = part.match(/^## (.+)/m);
      const heading = headingMatch?.[1]?.trim() ?? 'Overview';
      return { module: file.module, section: heading, text: stripMarkdown(part) };
    })
    .filter(c => c.text.length > 20);
}

async function isIndexStale(projectDir: string): Promise<boolean> {
  const idxPath = join(resolve(projectDir), '.knowledge', '.index.json');
  let idxMtime: number;
  try {
    idxMtime = (await stat(idxPath)).mtimeMs;
  } catch {
    return true;
  }
  const files = await readKnowledgeBase(projectDir);
  for (const f of files) {
    if ((await stat(f.path)).mtimeMs > idxMtime) return true;
  }
  return false;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] ** 2;
    nb += b[i] ** 2;
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-10);
}

export async function rebuildIndex(projectDir: string, config: Config): Promise<void> {
  const ollama = createOllamaClient(config);
  const files = await readKnowledgeBase(projectDir);
  const chunks = files.flatMap(chunkFile);
  const entries: VectorEntry[] = await Promise.all(
    chunks.map(async chunk => ({
      id: `${chunk.module}::${chunk.section}`,
      module: chunk.module,
      section: chunk.section,
      text: chunk.text,
      embedding: await ollama.embed(chunk.text),
    }))
  );
  await saveIndex(projectDir, upsertEntries({ version: 1, entries: [] }, entries));
}

export async function searchKnowledge(
  projectDir: string,
  query: string,
  topK: number,
  config: Config,
): Promise<SearchResult[]> {
  if (await isIndexStale(projectDir)) await rebuildIndex(projectDir, config);
  const index = await loadIndex(projectDir);
  const ollama = createOllamaClient(config);
  const qVec = await ollama.embed(query);
  const scored: SearchResult[] = index.entries.map(e => ({
    module: e.module,
    section: e.section,
    text: e.text,
    score: cosineSimilarity(qVec, e.embedding),
  }));
  return scored.sort((a, b) => b.score - a.score).slice(0, topK);
}
```

---

### Step 9 — `src/scaffold/index.ts`

See `.knowledge/modules/scaffold.md`. Inline template strings for `init`. Source discovery + Claude call for `generate`.

**Key implementation notes:**
- `initKnowledgeBase`: write each template file only if it does not already exist (`access()` check before each write — idempotent).
- `generateKnowledgeBase`: collect source files up to 100KB total, build a single prompt, call Claude, parse `=== filename ===` / `=== end ===` blocks, call `writeKnowledgeFile` for each, then `rebuildIndex`.
- The generation system prompt instructs Claude to output files in `=== path/within/.knowledge/ ===\n<content>\n=== end ===` format.
- `createClaudeClient(config)` throws `KnowledgeError('CLAUDE_UNAVAILABLE')` if no API key — let it propagate.

Imports needed: `readFile`, `writeFile`, `mkdir`, `access`, `readdir`, `stat` from `fs/promises`; `join`, `resolve`, `relative`, `extname`, `dirname` from `path`.

**Template constants** — define these at the top of the file, above `initKnowledgeBase`:

```typescript
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
```

**`initKnowledgeBase` file list** — write these paths (relative to `.knowledge/`) with the corresponding template call:

```
architecture.md              → TEMPLATE_ARCHITECTURE(projectName ?? 'project')
conventions.md               → TEMPLATE_CONVENTIONS()
modules/example.md           → TEMPLATE_MODULE('example')
decisions/001-example.md     → TEMPLATE_DECISION('001-example')
skills/planning.md           → TEMPLATE_SKILL('planning')
skills/coding.md             → TEMPLATE_SKILL('coding')
skills/updater.md            → TEMPLATE_SKILL('updater')
```

---

### Step 10 — `src/mcp/tools.ts`

See `.knowledge/modules/mcp-server.md`.

Register all 6 tools inside `registerTools`. Use `ListToolsRequestSchema` and `CallToolRequestSchema` from `@modelcontextprotocol/sdk/types.js`.

**Tool input schemas (JSON Schema format for MCP):**

```typescript
// read_knowledge_base
{ type: 'object', properties: { module: { type: 'string' } } }

// search_knowledge
{ type: 'object', properties: { query: { type: 'string' }, top_k: { type: 'number', default: 5 } }, required: ['query'] }

// write_plan
{ type: 'object', properties: { content: { type: 'string' } }, required: ['content'] }

// update_knowledge
{ type: 'object', properties: { module: { type: 'string' }, changed_files: { type: 'array', items: { type: 'string' } } }, required: ['module', 'changed_files'] }

// init_knowledge_base
{ type: 'object', properties: { project_name: { type: 'string' } } }

// generate_knowledge_base
{ type: 'object', properties: { source_dirs: { type: 'array', items: { type: 'string' } } } }
```

**`update_knowledge` handler logic:**
1. Read the current module doc with `readKnowledgeBase(cwd, moduleName)`.
2. Read the `changed_files` source content.
3. Build a prompt: "Here is the current knowledge doc:\n{doc}\n\nHere are the changed source files:\n{sources}\n\nRewrite the doc to reflect the changes. Keep unchanged sections verbatim."
4. Call `ollamaClient.generate(prompt)`.
5. Write result back with `writeKnowledgeFile`.

**`write_plan` handler logic:**
Write `content` to `PLAN.md` in `cwd` using `writeFile`.

All handlers: wrap in try/catch, return `{ isError: true, content: [{ type: 'text', text: err.message }] }` on error.

MCP SDK imports:
```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
```

---

### Step 11 — `src/mcp/server.ts`

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { type Config } from '../types.js';
import { registerTools } from './tools.js';

export async function startServer(config: Config): Promise<void> {
  const cwd = process.cwd();
  const server = new Server(
    { name: 'knowledge-mcp', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );
  registerTools(server, config, cwd);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
```

---

### Step 12 — `src/cli/index.ts`

Use `commander` `Command`. Register 5 subcommands. Each handler calls the appropriate core function and writes to `process.stdout`. On error: write to `process.stderr` and `process.exit(1)`.

```typescript
import { Command } from 'commander';
import { type Config } from '../types.js';
// Import: initKnowledgeBase, generateKnowledgeBase from '../scaffold/index.js'
// Import: searchKnowledge from '../search/engine.js'
// Import: readKnowledgeBase from '../knowledge/reader.js'
// Import: createOllamaClient from '../ollama/client.js'
// Import: writeKnowledgeFile from '../knowledge/writer.js'
// Import: startServer from '../mcp/server.js'

export async function runCLI(config: Config, argv: string[]): Promise<void> {
  const program = new Command();
  program.name('knowledge-mcp').description('Knowledge base manager for AI-assisted development');

  program
    .command('init [projectName]')
    .description('Scaffold .knowledge/ in the current project')
    .action(async (projectName?: string) => { /* initKnowledgeBase(cwd, projectName) */ });

  program
    .command('generate')
    .description('Generate knowledge base from source code (requires Anthropic API key)')
    .option('--src <dirs...>', 'Source directories', ['src'])
    .action(async (opts) => { /* generateKnowledgeBase(cwd, opts.src, config) */ });

  program
    .command('update [module]')
    .description('Update one or all module docs via Ollama')
    .action(async (module?: string) => { /* update logic */ });

  program
    .command('search <query>')
    .description('Semantic search the knowledge base')
    .option('--top <n>', 'Number of results', '5')
    .action(async (query: string, opts) => {
      const results = await searchKnowledge(process.cwd(), query, parseInt(opts.top), config);
      for (const r of results) {
        process.stdout.write(`[${r.score.toFixed(2)}] ${r.module} > ${r.section}: ${r.text.slice(0, 120)}\n`);
      }
    });

  program
    .command('serve')
    .description('Start MCP server (stdio mode)')
    .action(async () => { await startServer(config); });

  await program.parseAsync(argv);
}
```

---

### Step 13 — `src/index.ts`

**The first line must be the shebang.**

```typescript
#!/usr/bin/env node
import { loadConfig } from './config.js';
import { startServer } from './mcp/server.js';
import { runCLI } from './cli/index.js';

const config = await loadConfig();
const arg = process.argv[2];

if (!arg || arg === 'serve') {
  await startServer(config);
} else {
  await runCLI(config, process.argv);
}
```

---

## Verification Checklist

After all files are implemented:

1. `npm run typecheck` — zero TypeScript errors
2. `npm run build` — compiles successfully, `dist/index.js` is executable
3. `node dist/index.js init` — creates `.knowledge/` scaffold in current dir
4. `node dist/index.js search "test query"` — runs (may fail if Ollama not running, but should not crash with unhandled exception)
5. `node dist/index.js serve` — starts without error (MCP client can connect via stdio)
6. Global install test: `npm install -g . && knowledge-mcp --version`

---

## Key Invariants

| Rule | Why |
|------|-----|
| No `process.stdout.write` in library code | MCP stdio transport owns stdout |
| All local imports end in `.js` | Node ESM + `moduleResolution: NodeNext` |
| Shebang on line 1 of `src/index.ts` | Required for `chmod +x` to work as global CLI |
| `ConfigSchema.parse({})` returns all defaults | Config file absence is not an error |
| `loadIndex` returns empty index if file missing | First-run safety |
| `rebuildIndex` writes atomically via `.tmp` rename | Prevents corrupt index on crash |

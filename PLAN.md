# Implementation Plan: AGENTS.md, verify_project, Auto-context Injection

## Before writing any code

Read these knowledge docs in order:
1. `.knowledge/modules/scaffold.md` — AGENTS.md constraints (root placement, `writeFile` not `writeKnowledgeFile`, idempotency, init file list)
2. `.knowledge/modules/mcp-server.md` — `verify_project` handler contract, `read_knowledge_base` no-arg behavior
3. `.knowledge/modules/agents-md.md` — template structure and content rules
4. `.knowledge/decisions/005-agents-md.md` — why root placement, why verification lives in conventions.md

---

## No new dependencies. No type changes.

`child_process` and `util` are Node.js built-ins. `src/types.ts` is unchanged.

---

## Files to modify

| File | What changes |
|---|---|
| `src/scaffold/index.ts` | Add `TEMPLATE_AGENTS_MD`; write `AGENTS.md` to project root in `initKnowledgeBase` |
| `src/mcp/tools.ts` | Append AGENTS.md in `read_knowledge_base` no-arg call; add `verify_project` tool |

---

## Step 1 — `src/scaffold/index.ts`

### 1a. Add `TEMPLATE_AGENTS_MD` function

Place after `TEMPLATE_SKILL`, before the `INIT_FILES` constant:

```typescript
function TEMPLATE_AGENTS_MD(projectName: string): string {
  return `# ${projectName}

## Knowledge Base
This project uses knowledge-mcp. Read \`.knowledge/\` before writing code.
Start every session: call \`read_knowledge_base\` with no arguments.

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
```

### 1b. Write `AGENTS.md` at the start of `initKnowledgeBase`

Per `scaffold.md`: AGENTS.md goes to `projectDir` directly (not inside `.knowledge/`). Use `writeFile` directly — never `writeKnowledgeFile`. Same idempotency rule: skip if file exists.

Add before the existing `.knowledge/` file loop:

```typescript
// AGENTS.md lives in project root, not inside .knowledge/
const agentsPath = join(resolve(projectDir), 'AGENTS.md');
if (!await exists(agentsPath)) {
  await writeFile(agentsPath, TEMPLATE_AGENTS_MD(name), 'utf-8');
}
```

Also consolidate the `projectName ?? 'project'` into a `name` variable used by both AGENTS.md and `TEMPLATE_ARCHITECTURE`.

Run `npx tsc --noEmit` before proceeding.

---

## Step 2 — `src/mcp/tools.ts`

### 2a. Add imports at top of file

```typescript
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
```

### 2b. Add `verify_project` schema constant

```typescript
const VERIFY_PROJECT_SCHEMA = {
  type: 'object',
  properties: {},
} as const;
```

### 2c. Append to `TOOLS` array

```typescript
{
  name: 'verify_project',
  description: 'Run project verification commands from ## Verification in .knowledge/conventions.md. Returns stdout and stderr for each command. Use after writing code to self-correct without human intervention.',
  inputSchema: VERIFY_PROJECT_SCHEMA,
},
```

### 2d. Update `read_knowledge_base` handler

When no `module` filter is provided, append `AGENTS.md` from the project root if it exists. Per `mcp-server.md`: this makes the no-arg call the canonical full-context call. When a `module` filter is given, do not include AGENTS.md.

```typescript
case 'read_knowledge_base': {
  const module = (params.module as string) || undefined;
  const files = await readKnowledgeBase(projectDir, module);
  const output = files
    .map(f => `---\nmodule: ${f.module}\nupdated: ${f.updated}\nfiles: ${JSON.stringify(f.files)}\n---\n\n${f.content}\n`)
    .join('\n---\n\n');

  if (!module) {
    const agentsPath = join(resolve(projectDir), 'AGENTS.md');
    try {
      const agentsContent = await readFile(agentsPath, 'utf-8');
      const separator = output ? '\n\n---\n\n' : '';
      return createToolResponse(toolName, `${output}${separator}## AGENTS.md\n\n${agentsContent}`);
    } catch {
      // AGENTS.md does not exist — return knowledge files only
    }
  }

  return createToolResponse(toolName, output);
}
```

### 2e. Add `verify_project` handler in the switch

Per `mcp-server.md`: reads `## Verification` section from `conventions.md`, extracts `` - `<command>` `` bullets, runs each sequentially via `execAsync` with 60s timeout, returns combined output.

```typescript
case 'verify_project': {
  const conventions = await readKnowledgeBase(projectDir, 'conventions');
  if (conventions.length === 0) {
    return createToolResponse(toolName,
      'No conventions.md found. Cannot determine verification commands.'
    );
  }

  const content = conventions[0].content;
  const sectionMatch = content.match(/^## Verification\n([\s\S]*?)(?=^## |\s*$)/m);
  if (!sectionMatch) {
    return createToolResponse(toolName,
      'No ## Verification section in conventions.md.\n\nAdd one:\n## Verification\n- `npx tsc --noEmit`'
    );
  }

  const commands: string[] = [];
  const cmdRegex = /^- `(.+?)`/gm;
  let match: RegExpExecArray | null;
  while ((match = cmdRegex.exec(sectionMatch[1])) !== null) {
    commands.push(match[1]);
  }

  if (commands.length === 0) {
    return createToolResponse(toolName,
      'No commands found in ## Verification section. Format each as: - `<command>`'
    );
  }

  const results: string[] = [];
  for (const cmd of commands) {
    try {
      const { stdout, stderr } = await execAsync(cmd, { cwd: projectDir, timeout: 60_000 });
      const out = [stdout, stderr].filter(Boolean).join('\n').trim();
      results.push(`$ ${cmd}\n${out || '(no output — passed)'}`);
    } catch (err) {
      const e = err as { stdout?: string; stderr?: string; message?: string };
      const out = [e.stdout, e.stderr].filter(Boolean).join('\n').trim();
      results.push(`$ ${cmd}\n${out || e.message || 'command failed'}`);
    }
  }

  return createToolResponse(toolName, results.join('\n\n'));
}
```

Run `npx tsc --noEmit` before proceeding.

---

## Verification

1. `npm run typecheck` — zero errors
2. `npm run build` — compiles; `dist/index.js` executable
3. `node dist/index.js init myapp -d /tmp/kbtest` — creates both `AGENTS.md` at `/tmp/kbtest/AGENTS.md` and `.knowledge/` directory
4. `cat /tmp/kbtest/AGENTS.md` — shows template with `# myapp` heading
5. Run `init` again on same dir — neither `AGENTS.md` nor any `.knowledge/` file is overwritten
6. MCP `read_knowledge_base` (no args) — response ends with `## AGENTS.md` section
7. MCP `verify_project` — returns output of `npx tsc --noEmit`
8. `rm -rf /tmp/kbtest`

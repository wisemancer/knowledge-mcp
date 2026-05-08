import { readFile, writeFile } from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';
import { join, resolve, relative } from 'path';

const execAsync = promisify(exec);
import { type Config } from '../types.js';
import { readKnowledgeBase } from '../knowledge/reader.js';
import { writeKnowledgeFile } from '../knowledge/writer.js';
import { createOllamaClient } from '../ollama/client.js';
import { rebuildIndex, searchKnowledge } from '../search/engine.js';
import { initKnowledgeBase, generateKnowledgeBase } from '../scaffold/index.js';

// MCP SDK imports
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';

// Tool input schemas (JSON Schema format for MCP)
const READ_KNOWLEDGE_BASE_SCHEMA = {
  type: 'object',
  properties: {
    module: { type: 'string' },
  },
} as const;

const SEARCH_KNOWLEDGE_SCHEMA = {
  type: 'object',
  properties: {
    query: { type: 'string' },
    top_k: { type: 'number', default: 5 },
  },
  required: ['query'],
} as const;

const WRITE_PLAN_SCHEMA = {
  type: 'object',
  properties: {
    content: { type: 'string' },
  },
  required: ['content'],
} as const;

const UPDATE_KNOWLEDGE_SCHEMA = {
  type: 'object',
  properties: {
    module: { type: 'string' },
    changed_files: { type: 'array', items: { type: 'string' } },
  },
  required: ['module', 'changed_files'],
} as const;

const INIT_KNOWLEDGE_BASE_SCHEMA = {
  type: 'object',
  properties: {
    project_name: { type: 'string' },
  },
} as const;

const GENERATE_KNOWLEDGE_BASE_SCHEMA = {
  type: 'object',
  properties: {
    source_dirs: { type: 'array', items: { type: 'string' } },
  },
} as const;

const VERIFY_PROJECT_SCHEMA = {
  type: 'object',
  properties: {},
} as const;

// Tool definitions for MCP
const TOOLS = [
  {
    name: 'read_knowledge_base',
    description: 'Read the knowledge base for the given module. If no module is specified, all modules are returned.',
    inputSchema: READ_KNOWLEDGE_BASE_SCHEMA,
  },
  {
    name: 'search_knowledge',
    description: 'Search the knowledge base for relevant information about the given query. Returns top-k most relevant results.',
    inputSchema: SEARCH_KNOWLEDGE_SCHEMA,
  },
  {
    name: 'write_plan',
    description: 'Write a plan or document to the project root. The content should be written to PLAN.md.',
    inputSchema: WRITE_PLAN_SCHEMA,
  },
  {
    name: 'update_knowledge',
    description: 'Update a knowledge module based on changed source files. Provides the current knowledge and changed files, and rewrites the module.',
    inputSchema: UPDATE_KNOWLEDGE_SCHEMA,
  },
  {
    name: 'init_knowledge_base',
    description: 'Initialize the knowledge base for a project. Creates initial template files with architecture, conventions, modules, decisions, and skills.',
    inputSchema: INIT_KNOWLEDGE_BASE_SCHEMA,
  },
  {
    name: 'generate_knowledge_base',
    description: 'Generate knowledge base files from source code directories. Analyzes source files and creates comprehensive documentation.',
    inputSchema: GENERATE_KNOWLEDGE_BASE_SCHEMA,
  },
  {
    name: 'verify_project',
    description: 'Run project verification commands from ## Verification in .knowledge/conventions.md. Returns stdout and stderr for each command. Use after writing code to self-correct without human intervention.',
    inputSchema: VERIFY_PROJECT_SCHEMA,
  },
];

function createToolResponse(toolName: string, content: string): { isError: boolean; content: Array<{ type: string; text: string }> } {
  return {
    isError: false,
    content: [{ type: 'text', text: content }],
  };
}

function createErrorResponse(error: unknown): { isError: boolean; content: Array<{ type: string; text: string }> } {
  return {
    isError: true,
    content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }],
  };
}

async function listTools(): Promise<typeof TOOLS> {
  return TOOLS;
}

async function executeTool(
  toolName: string,
  params: Record<string, unknown>,
  projectDir: string,
  config: Config,
): Promise<{ isError: boolean; content: Array<{ type: string; text: string }> }> {
  try {
    switch (toolName) {
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

      case 'search_knowledge': {
        const query = params.query as string;
        const topK = (params.top_k as number) || 5;
        const results = await searchKnowledge(projectDir, query, topK, config);
        const output = results
          .map(r => `module: ${r.module}\nsection: ${r.section}\nscore: ${r.score.toFixed(4)}\n\n${r.text}`)
          .join('\n\n---\n\n');
        return createToolResponse(toolName, output);
      }

      case 'write_plan': {
        const content = params.content as string;
        const planPath = join(resolve(projectDir), 'PLAN.md');
        await writeFile(planPath, content, 'utf-8');
        return createToolResponse(toolName, `Plan written to ${planPath}`);
      }

      case 'update_knowledge': {
        const module = params.module as string;
        const changedFiles = params.changed_files as string[];

        // Read current knowledge
        const knowledge = await readKnowledgeBase(projectDir, module);
        if (knowledge.length === 0) {
          return createErrorResponse(new Error(`Module '${module}' not found in knowledge base`));
        }

        // Read changed files
        const changedFileContents = await Promise.all(
          changedFiles.map(async f => {
            const fullPath = join(resolve(projectDir), f);
            try {
              const content = await readFile(fullPath, 'utf-8');
              return `=== ${f} ===\n${content}\n=== end ===`;
            } catch {
              return `=== ${f} ===\n[File not found]\n=== end ===`;
            }
          })
        );

        // Build prompt for Ollama
        const prompt = `Here is the current knowledge doc for module '${module}':
${knowledge[0].content}

Here are the changed source files:
${changedFileContents.join('\n')}

Rewrite the knowledge document to reflect the changes. Keep unchanged sections verbatim. Update the 'updated' field to today's date. Preserve the frontmatter structure.`;

        // Call Ollama
        const ollama = createOllamaClient(config);
        const response = await ollama.generate(prompt);

        // Extract content after frontmatter (remove existing frontmatter if present)
        const cleaned = response.replace(/^---\n[\s\S]*?\n---\n/, '');

        // Write result back to the original file path
        const kDir = join(resolve(projectDir), '.knowledge');
        const relPath = relative(kDir, knowledge[0].path);
        await writeKnowledgeFile(
          projectDir,
          relPath,
          `---\nmodule: ${module}\nupdated: ${new Date().toISOString().slice(0, 10)}\nfiles: []\n---\n\n${cleaned.trim()}\n`,
        );

        // Rebuild index
        await rebuildIndex(projectDir, config);

        return createToolResponse(toolName, `Knowledge for module '${module}' updated successfully`);
      }

      case 'init_knowledge_base': {
        const projectName = (params.project_name as string) || undefined;
        await initKnowledgeBase(projectDir, projectName);
        return createToolResponse(toolName, 'Knowledge base initialized successfully');
      }

      case 'generate_knowledge_base': {
        const sourceDirs = (params.source_dirs as string[] | undefined) ?? [];
        if (sourceDirs.length === 0) {
          return createErrorResponse(new Error('No source directories specified'));
        }
        await generateKnowledgeBase(projectDir, config, sourceDirs);
        return createToolResponse(toolName, 'Knowledge base generated successfully');
      }

      case 'verify_project': {
        const conventions = await readKnowledgeBase(projectDir, 'conventions');
        if (conventions.length === 0) {
          return createToolResponse(toolName, 'No conventions.md found. Cannot determine verification commands.');
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

      default:
        return createErrorResponse(new Error(`Unknown tool: ${toolName}`));
    }
  } catch (error) {
    return createErrorResponse(error);
  }
}

export function registerTools(server: Server, projectDir: string, config: Config): void {
  // Register tool listing
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
  }));

  // Register tool execution
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: params } = request.params;
    const result = await executeTool(name, params || {}, projectDir, config);
    return result;
  });
}

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { type Config, type ErrorCode } from '../types.js';
import { readKnowledgeBase } from '../knowledge/reader.js';
import { writeKnowledgeFile } from '../knowledge/writer.js';
import { searchKnowledge } from '../search/engine.js';
import { initKnowledgeBase, generateKnowledgeBase } from '../scaffold/index.js';
import { writeFile } from 'fs/promises';

export function registerTools(server: Server, config: Config, cwd: string): void {
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'read_knowledge_base',
        description: 'Read all knowledge files, optionally filtered by module',
        inputSchema: {
          type: 'object',
          properties: {
            module: { type: 'string', description: 'Optional module name to filter by' },
          },
        },
      },
      {
        name: 'search_knowledge',
        description: 'Semantic search the knowledge base',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' },
            top_k: { type: 'number', description: 'Number of results', default: 5 },
          },
          required: ['query'],
        },
      },
      {
        name: 'write_plan',
        description: 'Write content to PLAN.md in the project root',
        inputSchema: {
          type: 'object',
          properties: {
            content: { type: 'string', description: 'File content' },
          },
          required: ['content'],
        },
      },
      {
        name: 'update_knowledge',
        description: 'Update a knowledge module based on changed source files',
        inputSchema: {
          type: 'object',
          properties: {
            module: { type: 'string', description: 'Module name to update' },
            changed_files: { type: 'array', items: { type: 'string' }, description: 'Paths to changed source files' },
          },
          required: ['module', 'changed_files'],
        },
      },
      {
        name: 'init_knowledge_base',
        description: 'Initialize .knowledge/ scaffold in current project',
        inputSchema: {
          type: 'object',
          properties: {
            project_name: { type: 'string', description: 'Optional project name' },
          },
        },
      },
      {
        name: 'generate_knowledge_base',
        description: 'Generate knowledge base from source code using Claude',
        inputSchema: {
          type: 'object',
          properties: {
            source_dirs: { type: 'array', items: { type: 'string' }, description: 'Source directories to analyze' },
          },
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      const name = request.params.name;
      const args = request.params.arguments ?? {};

      if (name === 'read_knowledge_base') {
        const input = args as { module?: string };
        const files = await readKnowledgeBase(cwd, input.module);
        const text = files.map(f => `=== ${f.module} ===\n${f.content}`).join('\n\n');
        return { isError: false, content: [{ type: 'text', text }] };
      }

      if (name === 'search_knowledge') {
        const input = args as { query: string; top_k?: number };
        const results = await searchKnowledge(cwd, input.query, input.top_k ?? 5, config);
        const text = results.map(r => `[${r.score.toFixed(2)}] ${r.module} > ${r.section}\n${r.text.slice(0, 300)}`).join('\n\n');
        return { isError: false, content: [{ type: 'text', text }] };
      }

      if (name === 'write_plan') {
        const input = args as { content: string };
        await writeFile(`${cwd}/PLAN.md`, input.content, 'utf-8');
        return { isError: false, content: [{ type: 'text', text: 'PLAN.md written successfully' }] };
      }

      if (name === 'update_knowledge') {
        const input = args as { module: string; changed_files: string[] };
        // This would be implemented as: read module, read changed files, call Ollama to update
        // For now, just acknowledge
        return { isError: false, content: [{ type: 'text', text: `Module ${input.module} update requested` }] };
      }

      if (name === 'init_knowledge_base') {
        const input = args as { project_name?: string };
        await initKnowledgeBase(cwd, input.project_name);
        return { isError: false, content: [{ type: 'text', text: '.knowledge/ initialized' }] };
      }

      if (name === 'generate_knowledge_base') {
        const input = args as { source_dirs?: string[] };
        await generateKnowledgeBase(cwd, input.source_dirs ?? ['src'], config);
        return { isError: false, content: [{ type: 'text', text: 'Knowledge base generated' }] };
      }

      return { isError: true, content: [{ type: 'text', text: `Unknown tool: ${name}` }] };
    } catch (e: unknown) {
      const err = e as Error;
      return { isError: true, content: [{ type: 'text', text: err.message }] };
    }
  });
}

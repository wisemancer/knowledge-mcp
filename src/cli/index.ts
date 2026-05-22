import { Command } from 'commander';
import { type Config } from '../types.js';
import { initKnowledgeBase, generateKnowledgeBase } from '../scaffold/index.js';
import { searchKnowledge } from '../search/engine.js';
import { readKnowledgeBase } from '../knowledge/reader.js';
import { startServer } from '../mcp/server.js';

export async function runCLI(config: Config, argv: string[]): Promise<void> {
  const program = new Command();
  const cwd = process.cwd();

  program.name('knowledge-mcp').description('Knowledge base manager for AI-assisted development');

  program
    .command('init [projectName]')
    .description('Scaffold .knowledge/ in the current project')
    .action(async (projectName?: string) => {
      try {
        await initKnowledgeBase(cwd, projectName);
        process.stdout.write('.knowledge/ initialized\n');
      } catch (e: unknown) {
        const err = e as Error;
        process.stderr.write(`Error: ${err.message}\n`);
        process.exit(1);
      }
    });

  program
    .command('generate')
    .description('Generate knowledge base from source code (optional: set anthropic_api_key for auto-generation)')
    .option('--src <dirs...>', 'Source directories', ['src'])
    .action(async (opts: { src: string[] }) => {
      try {
        await generateKnowledgeBase(cwd, opts.src, config);
        process.stdout.write('Knowledge base generated\n');
      } catch (e: unknown) {
        const err = e as Error;
        process.stderr.write(`Error: ${err.message}\n`);
        process.exit(1);
      }
    });

  program
    .command('read [module]')
    .description('Read knowledge base files')
    .action(async (module?: string) => {
      try {
        const files = await readKnowledgeBase(cwd, module);
        for (const f of files) {
          process.stdout.write(`\n=== ${f.module} (${f.path}) ===\n${f.content}\n`);
        }
      } catch (e: unknown) {
        const err = e as Error;
        process.stderr.write(`Error: ${err.message}\n`);
        process.exit(1);
      }
    });

  program
    .command('search <query>')
    .description('Semantic search the knowledge base')
    .option('--top <n>', 'Number of results', '5')
    .action(async (query: string, opts: { top: string }) => {
      try {
        const results = await searchKnowledge(cwd, query, parseInt(opts.top), config);
        for (const r of results) {
          process.stdout.write(`[${r.score.toFixed(2)}] ${r.module} > ${r.section}: ${r.text.slice(0, 120)}\n`);
        }
      } catch (e: unknown) {
        const err = e as Error;
        process.stderr.write(`Error: ${err.message}\n`);
        process.exit(1);
      }
    });

  program
    .command('serve')
    .description('Start MCP server (stdio mode)')
    .action(async () => {
      try {
        await startServer(config);
      } catch (e: unknown) {
        const err = e as Error;
        process.stderr.write(`Error: ${err.message}\n`);
        process.exit(1);
      }
    });

  await program.parseAsync(argv);
}

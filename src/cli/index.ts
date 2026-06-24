import { Command } from 'commander';
import { readKnowledgeBase } from '../knowledge/reader.js';
import { searchKnowledge } from '../search/engine.js';
import { initKnowledgeBase, generateKnowledgeBase } from '../scaffold/index.js';
import { readFile } from 'fs/promises';
import { join, resolve, relative } from 'path';

export async function runCLI(args: string[]): Promise<void> {
  const program = new Command();

  program
    .name('knowledge-mcp')
    .description('AI-assisted knowledge base manager for development projects')
    .version('0.1.0');

  // init [projectName]
  program
    .command('init [projectName]')
    .description('Initialize the knowledge base for a project')
    .option('-d, --dir <path>', 'project directory (default: current working directory)')
    .action(async (projectName?: string, opts?: { dir?: string }) => {
      try {
        const projectDir = opts?.dir ?? process.cwd();
        await initKnowledgeBase(projectDir, projectName);
        process.stdout.write(`Knowledge base initialized at ${projectDir}/.knowledge/\n`);
      } catch (error) {
        process.stderr.write(`Error initializing knowledge base: ${error instanceof Error ? error.message : String(error)}\n`);
        process.exit(1);
      }
    });

  // generate
  program
    .command('generate')
    .description('Generate knowledge base files from source code directories')
    .requiredOption('-d, --source-dirs <dirs...>', 'source directories to scan (comma-separated or repeated)')
    .action(async (opts: { sourceDirs: string[] }) => {
      try {
        const projectDir = process.cwd();
        const sourceDirs = opts.sourceDirs.flatMap((d: string) =>
          d.includes(',') ? d.split(',').map((s: string) => s.trim()) : [d]
        );
        if (sourceDirs.length === 0) {
          process.stderr.write('Error: No source directories specified. Use -d <dir> [dir ...]\n');
          process.exit(1);
        }
        const output = await generateKnowledgeBase(projectDir, sourceDirs);
        process.stdout.write(output + '\n');
      } catch (error) {
        process.stderr.write(`Error generating knowledge base: ${error instanceof Error ? error.message : String(error)}\n`);
        process.exit(1);
      }
    });

  // update <module>
  program
    .command('update <module>')
    .description('Update a knowledge module based on changed source files')
    .option('-d, --dir <path>', 'project directory (default: current working directory)')
    .option('-f, --files <files...>', 'changed source files to include')
    .action(async (module: string, opts?: { dir?: string; files?: string[] }) => {
      try {
        const projectDir = opts?.dir ?? process.cwd();

        const knowledgeFiles = await readKnowledgeBase(projectDir, module);
        if (knowledgeFiles.length === 0) {
          process.stderr.write(`Error: Module '${module}' not found in knowledge base\n`);
          process.exit(1);
        }

        const changedFileContents = opts?.files && opts.files.length > 0
          ? await Promise.all(
              opts.files.map(async (f) => {
                const fullPath = join(resolve(projectDir), f);
                try {
                  const content = await readFile(fullPath, 'utf-8');
                  return `=== ${f} ===\n${content}\n=== end ===`;
                } catch {
                  return `=== ${f} ===\n[File not found]\n=== end ===`;
                }
              })
            )
          : ['[No changed files provided]'];

        // Standalone MCP: no external model. Emit the current doc + changed source so the
        // operator (or an agent) can rewrite the doc. Mirrors the update_knowledge MCP tool.
        const kDir = join(resolve(projectDir), '.knowledge');
        const relPath = relative(kDir, knowledgeFiles[0].path);
        process.stdout.write(
          [
            `Current knowledge doc for module '${module}' (.knowledge/${relPath}):`,
            '',
            knowledgeFiles[0].content,
            '',
            'Changed source files:',
            changedFileContents.join('\n'),
            '',
            '---',
            `Rewrite the doc to reflect these changes and save it to .knowledge/${relPath}.`,
            'Keep unchanged sections verbatim; preserve markers, citations, layer and tier.',
            '',
          ].join('\n'),
        );
      } catch (error) {
        process.stderr.write(`Error updating knowledge: ${error instanceof Error ? error.message : String(error)}\n`);
        process.exit(1);
      }
    });

  // search <query>
  program
    .command('search <query>')
    .description('Search the knowledge base for relevant information')
    .option('-k, --top-k <number>', 'number of results to return', '5')
    .option('-d, --dir <path>', 'project directory (default: current working directory)')
    .action(async (query: string, opts?: { topK?: string; dir?: string }) => {
      try {
        const projectDir = opts?.dir ?? process.cwd();
        const topK = parseInt(opts?.topK ?? '5', 10);
        const results = await searchKnowledge(projectDir, query, topK);

        if (results.length === 0) {
          process.stdout.write('No results found.\n');
          return;
        }

        for (const r of results) {
          process.stdout.write(`[${r.score.toFixed(2)}] ${r.module} > ${r.section}: ${r.text.slice(0, 120)}\n`);
        }
      } catch (error) {
        process.stderr.write(`Error searching knowledge: ${error instanceof Error ? error.message : String(error)}\n`);
        process.exit(1);
      }
    });

  // serve / server
  program
    .command('serve')
    .alias('server')
    .description('Start the MCP server (stdio mode)')
    .action(async () => {
      const { startServer } = await import('../mcp/server.js');
      try {
        await startServer();
      } catch (error) {
        process.stderr.write(`Error starting MCP server: ${error instanceof Error ? error.message : String(error)}\n`);
        process.exit(1);
      }
    });

  await program.parseAsync(args, { from: 'user' });
}

import { Command } from "commander";
import { readKnowledgeBase } from "../knowledge/reader.js";
import { writeKnowledgeFile } from "../knowledge/writer.js";
import { rebuildIndex, searchKnowledge } from "../search/engine.js";
import { initKnowledgeBase } from "../scaffold/index.js";
import { createOllamaClient } from "../ollama/client.js";
import { createClaudeClient } from "../claude/client.js";
import { type Config, KnowledgeError } from "../types.js";
import { readFile, readdir, stat } from "fs/promises";
import { join, resolve, extname } from "path";

export async function runCLI(config: Config, args: string[]): Promise<void> {
  const program = new Command();

  program
    .name("knowledge-mcp")
    .description("AI-assisted knowledge base manager for development projects")
    .version("0.1.0");

  // init [projectName]
  program
    .command("init [projectName]")
    .description("Initialize the knowledge base for a project")
    .option(
      "-d, --dir <path>",
      "project directory (default: current working directory)",
    )
    .action(async (projectName?: string, opts?: { dir?: string }) => {
      try {
        const projectDir = opts?.dir ?? process.cwd();
        await initKnowledgeBase(projectDir, projectName);
        console.log(`Knowledge base initialized at ${projectDir}/.knowledge/`);
      } catch (error) {
        console.error(
          `Error initializing knowledge base: ${error instanceof Error ? error.message : String(error)}`,
        );
        process.exit(1);
      }
    });

  // generate
  program
    .command("generate")
    .description("Generate knowledge base files from source code directories")
    .requiredOption(
      "-d, --source-dirs <dirs...>",
      "source directories to scan (comma-separated or repeated)",
    )
    .option("-o, --output-dir <path>", "output directory (default: .knowledge)")
    .action(async (opts: { sourceDirs: string[]; outputDir?: string }) => {
      try {
        const projectDir = process.cwd();
        const sourceDirs = opts.sourceDirs
          .map((d: string) => {
            if (d.includes(","))
              return d.split(",").map((s: string) => s.trim());
            return d;
          })
          .flat();

        if (sourceDirs.length === 0) {
          console.error(
            "Error: No source directories specified. Use -d <dir> [dir ...]",
          );
          process.exit(1);
        }

        const claude = createClaudeClient(config);

        // Collect source files up to 100KB total
        let totalBytes = 0;
        const MAX_BYTES = 100 * 1024;
        const sourceFiles: Array<{ path: string; content: string }> = [];

        for (const dir of sourceDirs) {
          const entries = await walkDir(dir);
          for (const entry of entries) {
            if (totalBytes >= MAX_BYTES) break;
            const ext = getExt(entry);
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
            sourceFiles.push({ path: entry, content });
          }
          if (totalBytes >= MAX_BYTES) break;
        }

        if (sourceFiles.length === 0) {
          console.error(
            "Error: No source files found in the specified directories",
          );
          process.exit(1);
        }

        const prompt = `You are a knowledge base generator. Your task is to analyze the source code files provided and generate comprehensive knowledge base documentation.

The source code files are:
${sourceFiles
  .map(
    (f) => `=== ${f.path} ===
${f.content}
=== end ===`,
  )
  .join("\n\n")}

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

Be thorough but concise. Focus on what matters for future development.`;

        const systemPrompt = `You are a knowledge base generator. Output files in the format:

=== path/within/.knowledge/ ===
<markdown content with frontmatter>
=== end ===

Always include frontmatter with module, updated, and files fields.`;

        const response = await claude.generate(prompt, systemPrompt);

        // Parse response to extract knowledge files
        const fileRegex =
          /===\s*(.+?)\s*===\s*\n([\s\S]*?)\n\s*===\s*end\s*===/g;
        let match: RegExpExecArray | null;
        let count = 0;

        while ((match = fileRegex.exec(response)) !== null) {
          const path = match[1];
          const content = match[2];
          await writeKnowledgeFile(projectDir, path, content);
          count++;
        }

        if (count === 0) {
          console.error(
            "Error: No knowledge files could be parsed from the response",
          );
          process.exit(1);
        }

        // Rebuild the vector index
        await rebuildIndex(projectDir, config);

        console.log(
          `Generated ${count} knowledge file(s) and rebuilt the vector index`,
        );
      } catch (error) {
        console.error(
          `Error generating knowledge base: ${error instanceof Error ? error.message : String(error)}`,
        );
        process.exit(1);
      }
    });

  // update [module]
  program
    .command("update [module]")
    .description("Update a knowledge module based on changed source files")
    .option(
      "-d, --dir <path>",
      "project directory (default: current working directory)",
    )
    .option("-f, --files <files...>", "changed source files to include")
    .action(
      async (module?: string, opts?: { dir?: string; files?: string[] }) => {
        try {
          const projectDir = opts?.dir ?? process.cwd();

          if (!module) {
            console.error("Error: Module name is required");
            console.error(
              "Usage: knowledge-mcp update <module> [-f <file1> -f <file2>]",
            );
            process.exit(1);
          }

          // Read current knowledge
          const files = await readKnowledgeBase(projectDir, module);
          if (files.length === 0) {
            console.error(`Module '${module}' not found in knowledge base`);
            process.exit(1);
          }

          const changedFileContents =
            opts?.files && opts.files.length > 0
              ? await Promise.all(
                  opts.files.map(async (f) => {
                    const fullPath = require("path").join(
                      require("path").resolve(projectDir),
                      f,
                    );
                    try {
                      const content = await require("fs/promises").readFile(
                        fullPath,
                        "utf-8",
                      );
                      return `=== ${f} ===\n${content}\n=== end ===`;
                    } catch {
                      return `=== ${f} ===\n[File not found]\n=== end ===`;
                    }
                  }),
                )
              : ["[No changed files provided]"];

          // Build prompt for Ollama
          const prompt = `Here is the current knowledge doc for module '${module}':
${files[0].content}

Here are the changed source files:
${changedFileContents.join("\n")}

Rewrite the knowledge document to reflect the changes. Keep unchanged sections verbatim. Update the 'updated' field to today's date. Preserve the frontmatter structure.`;

          // Call Ollama
          const ollama = createOllamaClient(config);
          const response = await ollama.generate(prompt);

          // Extract content after frontmatter
          const cleaned = response.replace(/^---\n[\s\S]*?\n---\n/, "");

          // Write result
          await writeKnowledgeFile(
            projectDir,
            `${module}.md`,
            `---\nmodule: ${module}\nupdated: ${new Date().toISOString().slice(0, 10)}\nfiles: []\n---\n\n${cleaned.trim()}\n`,
          );

          // Rebuild index
          await rebuildIndex(projectDir, config);

          console.log(`Knowledge for module '${module}' updated successfully`);
        } catch (error) {
          console.error(
            `Error updating knowledge: ${error instanceof Error ? error.message : String(error)}`,
          );
          process.exit(1);
        }
      },
    );

  // search <query>
  program
    .command("search <query>")
    .description("Search the knowledge base for relevant information")
    .option("-k, --top-k <number>", "number of results to return", "5")
    .option(
      "-d, --dir <path>",
      "project directory (default: current working directory)",
    )
    .action(async (query: string, opts?: { topK?: string; dir?: string }) => {
      try {
        const projectDir = opts?.dir ?? process.cwd();
        const topK = parseInt(opts?.topK ?? "5", 10);
        const results = await searchKnowledge(projectDir, query, topK, config);

        if (results.length === 0) {
          console.log("No results found.");
          return;
        }

        for (const r of results) {
          console.log(`module: ${r.module}`);
          console.log(`section: ${r.section}`);
          console.log(`score: ${r.score.toFixed(4)}`);
          console.log();
          console.log(r.text);
          console.log("\n---\n");
        }
      } catch (error) {
        console.error(
          `Error searching knowledge: ${error instanceof Error ? error.message : String(error)}`,
        );
        process.exit(1);
      }
    });

  // server
  program
    .command("server")
    .description("Start the MCP server")
    .action(async () => {
      const { startServer } = await import("../mcp/server.js");
      try {
        await startServer(config);
      } catch (error) {
        console.error(
          `Error starting MCP server: ${error instanceof Error ? error.message : String(error)}`,
        );
        process.exit(1);
      }
    });

  await program.parseAsync(args);
}

// ── Helpers ──────────────────────────────────────────────────────

async function walkDir(dir: string): Promise<string[]> {
  const results: string[] = [];
  const entries = await readdir(dir);
  for (const entry of entries) {
    if (entry.startsWith(".")) continue;
    const fullPath = join(dir, entry);
    const s = await stat(fullPath);
    if (s.isDirectory()) results.push(...(await walkDir(fullPath)));
    else results.push(fullPath);
  }
  return results;
}

function getExt(path: string): string {
  return extname(path);
}

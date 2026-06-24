import { readFile, writeFile } from "fs/promises";
import { exec } from "child_process";
import { promisify } from "util";
import { join, resolve, relative } from "path";
import { type ProjectType } from "../types.js";

const execAsync = promisify(exec);
import { readKnowledgeBase } from "../knowledge/reader.js";
import { writeKnowledgeFile } from "../knowledge/writer.js";
import { verifyKnowledge } from "../knowledge/verify.js";
import { searchKnowledge } from "../search/engine.js";
import { initKnowledgeBase, generateKnowledgeBase, designProject } from "../scaffold/index.js";

// MCP SDK imports
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// Tool input schemas (JSON Schema format for MCP)
const READ_KNOWLEDGE_BASE_SCHEMA = {
  type: "object",
  properties: {
    module: { type: "string" },
  },
} as const;

const SEARCH_KNOWLEDGE_SCHEMA = {
  type: "object",
  properties: {
    query: { type: "string" },
    top_k: { type: "number", default: 5 },
  },
  required: ["query"],
} as const;

const WRITE_PLAN_SCHEMA = {
  type: "object",
  properties: {
    content: { type: "string" },
  },
  required: ["content"],
} as const;

const UPDATE_KNOWLEDGE_SCHEMA = {
  type: "object",
  properties: {
    module: { type: "string" },
    changed_files: { type: "array", items: { type: "string" } },
  },
  required: ["module", "changed_files"],
} as const;

const INIT_KNOWLEDGE_BASE_SCHEMA = {
  type: "object",
  properties: {
    project_name: { type: "string" },
  },
} as const;

const GENERATE_KNOWLEDGE_BASE_SCHEMA = {
  type: "object",
  properties: {
    source_dirs: { type: "array", items: { type: "string" } },
    language: {
      type: "string",
      enum: ["swift", "node", "go", "rust", "python", "java", "cpp", "generic"],
      description: "Force the project type. If omitted, auto-detected from the project root.",
    },
  },
} as const;

const WRITE_KNOWLEDGE_FILE_SCHEMA = {
  type: "object",
  properties: {
    path: { type: "string" },
    content: { type: "string" },
  },
  required: ["path", "content"],
} as const;

const VERIFY_PROJECT_SCHEMA = {
  type: "object",
  properties: {},
} as const;

const DESIGN_PROJECT_SCHEMA = {
  type: "object",
  properties: {
    idea: { type: "string" },
  },
  required: ["idea"],
} as const;

const VERIFY_KNOWLEDGE_SCHEMA = {
  type: "object",
  properties: {},
} as const;

// Tool definitions for MCP
export const TOOLS: { name: string; description: string; inputSchema: any }[] =
  [
    {
      name: "read_knowledge_base",
      description:
        "Read the knowledge base for the given module. If no module is specified, all modules are returned.",
      inputSchema: READ_KNOWLEDGE_BASE_SCHEMA,
    },
    {
      name: "search_knowledge",
      description:
        "Search the knowledge base for relevant information about the given query. Returns top-k most relevant results.",
      inputSchema: SEARCH_KNOWLEDGE_SCHEMA,
    },
    {
      name: "write_plan",
      description:
        "Write a plan or document to the project root. The content should be written to PLAN.md.",
      inputSchema: WRITE_PLAN_SCHEMA,
    },
    {
      name: "update_knowledge",
      description:
        "Update a knowledge module after source changes. Returns the current module doc plus the changed source files for you to reason over; you rewrite the doc and save it with write_knowledge_file. No external model.",
      inputSchema: UPDATE_KNOWLEDGE_SCHEMA,
    },
    {
      name: "init_knowledge_base",
      description:
        "Initialize the knowledge base for a project. Creates initial template files with architecture, conventions, modules, decisions, and skills.",
      inputSchema: INIT_KNOWLEDGE_BASE_SCHEMA,
    },
    {
      name: "generate_knowledge_base",
      description:
        "Generate knowledge base files from source code directories. Analyzes source files and returns the collected source text for the caller to reason over.",
      inputSchema: GENERATE_KNOWLEDGE_BASE_SCHEMA,
    },
    {
      name: "write_knowledge_file",
      description:
        'Write a file to the .knowledge/ directory. path is relative to .knowledge/ (e.g. "canonical/modules/auth.md"). Call this after generate_knowledge_base returns source files and you have analyzed them.',
      inputSchema: WRITE_KNOWLEDGE_FILE_SCHEMA,
    },
    {
      name: "verify_project",
      description:
        "Run project verification commands from ## Verification in .knowledge/conventions.md. Returns stdout and stderr for each command. Use after writing code to self-correct without human intervention.",
      inputSchema: VERIFY_PROJECT_SCHEMA,
    },
    {
      name: "design_project",
      description:
        "Start a brand new project from a raw idea. Returns a structured design interview document with required gap markers (observability, tech stack, constraints, error handling). Claude resolves gaps with the user conversationally, then calls write_knowledge_file, init_knowledge_base, and write_plan. Call this before init_knowledge_base on a greenfield project.",
      inputSchema: DESIGN_PROJECT_SCHEMA,
    },
    {
      name: "verify_knowledge",
      description:
        "Validate the .knowledge/ base against the standard KB architecture (canonical/derived layers, epistemic markers, citations, source tiers, guardrails). Read-only, mechanical pass/fail. Run after writing knowledge files as the Verifier step of the Writer->Reviewer->Verifier loop.",
      inputSchema: VERIFY_KNOWLEDGE_SCHEMA,
    },
  ];

function createToolResponse(
  toolName: string,
  content: string,
): { isError: boolean; content: Array<{ type: string; text: string }> } {
  return {
    isError: false,
    content: [{ type: "text", text: content }],
  };
}

function createErrorResponse(error: unknown): {
  isError: boolean;
  content: Array<{ type: string; text: string }>;
} {
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: error instanceof Error ? error.message : String(error),
      },
    ],
  };
}

// Helper function to execute a tool's logic
async function executeTool(
  toolName: string,
  params: Record<string, unknown>,
  projectDir: string,
): Promise<{
  isError: boolean;
  content: Array<{ type: string; text: string }>;
}> {
  // Dispatch map replaces the switch statement for better TS compatibility
  const dispatch: {
    [key: string]: (
      params: Record<string, unknown>,
    ) => Promise<{
      isError: boolean;
      content: Array<{ type: string; text: string }>;
    }>;
  } = {
    read_knowledge_base: async (params) => {
      const module = (params.module as string) || undefined;
      const files = await readKnowledgeBase(projectDir, module);
      const output = files
        .map((f) => {
          const fm = [
            `module: ${f.module}`,
            ...(f.layer ? [`layer: ${f.layer}`] : []),
            ...(f.tier ? [`tier: ${f.tier}`] : []),
            `updated: ${f.updated}`,
            `files: ${JSON.stringify(f.files)}`,
          ].join("\n");
          return `---\n${fm}\n---\n\n${f.content}\n`;
        })
        .join("\n---\n\n");

      if (!module) {
        const agentsPath = join(resolve(projectDir), "AGENTS.md");
        try {
          const agentsContent = await readFile(agentsPath, "utf-8");
          const separator = output ? "\n\n---\n\n" : "";
          return createToolResponse(
            toolName,
            `${output}${separator}## AGENTS.md\n\n${agentsContent}`,
          );
        } catch {
          // AGENTS.md does not exist — return knowledge files only
        }
      }

      return createToolResponse(toolName, output);
    },

    search_knowledge: async (params) => {
      const query = params.query as string;
      const topK = (params.top_k as number) || 5;
      const results = await searchKnowledge(projectDir, query, topK);
      const output = results
        .map(
          (r) =>
            `module: ${r.module}\nsection: ${r.section}\nscore: ${r.score.toFixed(4)}\n\n${r.text}`,
        )
        .join("\n\n---\n\n");
      return createToolResponse(toolName, output);
    },

    write_plan: async (params) => {
      const content = params.content as string;
      const planPath = join(resolve(projectDir), "PLAN.md");
      await writeFile(planPath, content, "utf-8");
      return createToolResponse(toolName, `Plan written to ${planPath}`);
    },

    update_knowledge: async (params) => {
      const module = params.module as string;
      const changedFiles = params.changed_files as string[];

      // Read current knowledge
      const knowledge = await readKnowledgeBase(projectDir, module);
      if (knowledge.length === 0) {
        return createErrorResponse(
          new Error(`Module '${module}' not found in knowledge base`),
        );
      }

      // Read changed files
      const changedFileContents = await Promise.all(
        changedFiles.map(async (f) => {
          const fullPath = join(resolve(projectDir), f);
          try {
            const content = await readFile(fullPath, "utf-8");
            return `=== ${f} ===\n${content}\n=== end ===`;
          } catch {
            return `=== ${f} ===\n[File not found]\n=== end ===`;
          }
        }),
      );

      // Agent-driven: return the current doc + changed source for the caller (Claude Code)
      // to reason over and rewrite via write_knowledge_file. No external model.
      const kDir = join(resolve(projectDir), ".knowledge");
      const relPath = relative(kDir, knowledge[0].path);
      const layerLine = knowledge[0].layer ? `\nlayer: ${knowledge[0].layer}` : "";
      const tierLine = knowledge[0].tier ? `\ntier: ${knowledge[0].tier}` : "";

      const output = [
        `Current knowledge doc for module '${module}' (.knowledge/${relPath}):`,
        "",
        knowledge[0].content,
        "",
        "Changed source files:",
        changedFileContents.join("\n"),
        "",
        "---",
        `Rewrite the doc to reflect these changes, then save it by calling write_knowledge_file("${relPath}", <new content>).`,
        "Keep unchanged sections verbatim. Preserve the standard: markers on every claim, citations on every [EXPLICIT], canonical/derived layer and tier honored.",
        `Use this frontmatter (update the date to today):`,
        `---\nmodule: ${module}${layerLine}${tierLine}\nupdated: <YYYY-MM-DD>\nfiles: ${JSON.stringify(knowledge[0].files)}\n---`,
        "Then run verify_knowledge and fix any BLOCK.",
      ].join("\n");

      return createToolResponse(toolName, output);
    },

    init_knowledge_base: async (params) => {
      const projectName = (params.project_name as string) || undefined;
      await initKnowledgeBase(projectDir, projectName);
      return createToolResponse(
        toolName,
        "Knowledge base initialized successfully",
      );
    },

    generate_knowledge_base: async (params) => {
      const sourceDirs = (params.source_dirs as string[] | undefined) ?? [];
      if (sourceDirs.length === 0) {
        return createErrorResponse(
          new Error("No source directories specified"),
        );
      }
      const language = params.language as ProjectType | undefined;
      const output = await generateKnowledgeBase(projectDir, sourceDirs, language);
      return createToolResponse(toolName, output);
    },

    write_knowledge_file: async (params) => {
      const path = params.path as string;
      const content = params.content as string;
      await writeKnowledgeFile(projectDir, path, content);
      return createToolResponse(toolName, `Written: .knowledge/${path}`);
    },

    design_project: async (params) => {
      const idea = params.idea as string;
      const output = designProject(idea);
      return createToolResponse(toolName, output);
    },

    verify_knowledge: async () => {
      const report = await verifyKnowledge(projectDir);
      const blocks = report.findings.filter((f) => f.severity === "BLOCK");
      const flags = report.findings.filter((f) => f.severity === "FLAG");
      const summary = `verify_knowledge: ${report.pass ? "PASS" : "FAIL"} — ${blocks.length} BLOCK, ${flags.length} FLAG across ${report.filesChecked} files`;

      if (report.findings.length === 0) {
        return createToolResponse(
          toolName,
          `${summary}\n\nNo issues found. The knowledge base conforms to the standard.`,
        );
      }

      const byFile = new Map<string, typeof report.findings>();
      for (const f of [...blocks, ...flags]) {
        const list = byFile.get(f.file) ?? [];
        list.push(f);
        byFile.set(f.file, list);
      }
      const detail = [...byFile.entries()]
        .map(
          ([file, fs]) =>
            `${file}\n${fs.map((f) => `  [${f.severity}] ${f.code}: ${f.message}`).join("\n")}`,
        )
        .join("\n\n");

      const note =
        "\n\nManual review still required: KG2 (assumption laundering — a marker present in canonical dropped in derived) and KG5 (a critical claim resting on a single ambiguous source) are not mechanically checked.";

      return createToolResponse(toolName, `${summary}\n\n${detail}${note}`);
    },

    verify_project: async (params) => {
      const conventions = await readKnowledgeBase(projectDir, "conventions");
      if (conventions.length === 0) {
        return createToolResponse(
          toolName,
          "No conventions.md found. Cannot determine verification commands.",
        );
      }

      const content = conventions[0].content;
      const sectionMatch = content.match(
        /^## Verification\n([\s\S]*?)(?=^## |\s*$)/m,
      );
      if (!sectionMatch) {
        return createToolResponse(
          toolName,
          "No ## Verification section in conventions.md.\n\nAdd one:\n## Verification\n- `npx tsc --noEmit`",
        );
      }

      const commands: string[] = [];
      const cmdRegex = /^- `(.+?)`/gm;
      let match: RegExpExecArray | null;
      while ((match = cmdRegex.exec(sectionMatch[1])) !== null) {
        commands.push(match[1]);
      }

      if (commands.length === 0) {
        return createToolResponse(
          toolName,
          "No commands found in ## Verification section. Format each as: - `<command>`",
        );
      }

      const results: string[] = [];
      for (const cmd of commands) {
        try {
          const { stdout, stderr } = await execAsync(cmd, {
            cwd: projectDir,
            timeout: 60_000,
          });
          const out = [stdout, stderr].filter(Boolean).join("\n").trim();
          results.push(`$ ${cmd}\n${out || "(no output — passed)"}`);
        } catch (err) {
          const e = err as {
            stdout?: string;
            stderr?: string;
            message?: string;
          };
          const out = [e.stdout, e.stderr].filter(Boolean).join("\n").trim();
          results.push(`$ ${cmd}\n${out || e.message || "command failed"}`);
        }
      }

      return createToolResponse(toolName, results.join("\n\n"));
    },
  };

  try {
    const toolFunction = dispatch[toolName];
    if (!toolFunction) {
      throw new Error(`Unknown tool: ${toolName}`);
    }
    return toolFunction(params);
  } catch (error) {
    return createErrorResponse(error);
  }
}

export function registerTools(server: Server, projectDir: string): void {
  // Register tool listing
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
  }));

  // Register tool execution
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: params } = request.params;
    const result = await executeTool(name, params || {}, projectDir);
    return result;
  });
}

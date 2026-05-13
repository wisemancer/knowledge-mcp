# Plan: design_project MCP Tool + Knowledge-Base-Only Planning Rule

## Context

Two related changes:

1. **`design_project` tool**: Bridges the gap between a raw idea and a filled `.knowledge/` directory. Takes a free-form idea string, returns a structured design interview document with required gap markers (observability, tech stack, constraints, error handling). Claude resolves gaps conversationally, then writes knowledge files. Follows the `generate_knowledge_base` pattern: tool returns structured text, calling agent does reasoning and writes files.

2. **Knowledge-base-only planning rule**: Agents must read `.knowledge/` files only — never raw source code. Encoded in framework templates and memory.

---

## Files to Change

### New logic
- `src/scaffold/index.ts` — add `designProject(idea: string): Promise<string>`
- `src/mcp/tools.ts` — add `DESIGN_PROJECT_SCHEMA`, TOOLS entry, dispatch handler

### Knowledge base updates
- `.knowledge/conventions.md` — add to `## Agent Workflow`: read `.knowledge/` only; never raw source
- `.knowledge/skills/planning.md` — add anti-pattern: no raw source reads; `write_plan` is mandatory
- `.knowledge/modules/scaffold.md` — add `designProject` to `## Interfaces`
- `.knowledge/modules/mcp-server.md` — add 9th tool
- `.knowledge/decisions/006-design-project.md` — new decision record

### Scaffold templates (inherited by all new projects)
- `TEMPLATE_CONVENTIONS()` — add knowledge-base-only rule to `## Agent Workflow`
- `TEMPLATE_SKILL("planning")` stub — add anti-pattern: do not read source files

### Memory
- `memory/feedback_knowledge_first.md` — extend: never read raw source; use knowledge base tools

---

## Implementation Order

1. `src/scaffold/index.ts` — add `designProject()` below `generateKnowledgeBase`
2. `src/mcp/tools.ts` — add schema + TOOLS entry + dispatch handler
3. `.knowledge/conventions.md` — add knowledge-base-only rule
4. `.knowledge/skills/planning.md` — add anti-pattern + strengthen write_plan step
5. `.knowledge/modules/scaffold.md` and `mcp-server.md` — update docs
6. `.knowledge/decisions/006-design-project.md` — new file
7. `src/scaffold/index.ts` templates — update TEMPLATE_CONVENTIONS and planning skill stub
8. `memory/feedback_knowledge_first.md` — extend

---

## designProject() Output Format

```
## design_project: <first line of idea>

### Inferred from your idea
- Purpose: <idea verbatim, trimmed>

### Required gaps — resolve before writing any knowledge file

[GAP: Observability] NON-NEGOTIABLE
- Logging: events to log, format, destination
- Tracing: required? library?
- Metrics: counters/gauges/histograms and collection point
- Error reporting: how errors surface to operators

[GAP: Tech stack]
- Language / runtime
- Key frameworks — why
- Key dependencies — what each provides

[GAP: Constraints]
- What must never happen?
- What boundaries must never be crossed?

[GAP: Error handling contract]
- How are errors typed and thrown?
- Where caught? How surfaced to users/callers?

---
### Instructions for Claude
Ask the user about each [GAP] in order. Once resolved:
1. Call write_knowledge_file("architecture.md", <filled content>)
2. Call write_knowledge_file("conventions.md", <filled content with ## Observability>)
3. Call init_knowledge_base(project_name: "<name>")
4. Call write_plan(<implementation plan>)
Do not write any code until write_plan has been called.
```

---

## Verification

1. `npx tsc --noEmit` — must pass
2. Call `design_project(idea: "a CLI tool that syncs markdown notes to Notion")` — verify all 4 GAP sections present, Observability marked NON-NEGOTIABLE, Instructions block present
3. Call `init_knowledge_base` after — confirm AGENTS.md + `.knowledge/` scaffolded
4. Confirm `mcp-server.md` tool count updated to 9

---
module: skills/planning
updated: 2026-04-28
files: []
---

## Purpose
Instructions for an AI planning agent using the knowledge base to plan features or changes to knowledge-mcp.

## How to plan a feature

1. **Read architecture first**: Call `read_knowledge_base` with no filter. Study the data flow diagram and the constraints section — they define what is possible and what is forbidden.

2. **Identify affected modules**: For the feature, determine which modules are relevant. Read each with `read_knowledge_base(module: <name>)`. Note the `## Interfaces` section — these are the integration contracts you must respect.

3. **Search for prior patterns**: Use `search_knowledge` with the feature concept (e.g., `"add a new MCP tool"`, `"embedding pipeline"`) to surface relevant sections without reading all files.

4. **Check decision records**: Read `.knowledge/decisions/` files. A decision may directly constrain or validate your approach.

5. **Write the plan**: Call `write_plan` to produce `PLAN.md` in the project root. The plan is not complete until `PLAN.md` exists. Include:
   - Files to create or modify (with purpose)
   - Any new interfaces or type changes to `src/types.ts`
   - Implementation order (topological — dependencies before dependents)
   - Any new `package.json` dependencies and why

## Anti-patterns
- Do not plan changes that violate constraints in `architecture.md` (e.g., writing to stdout from library code, creating files outside `.knowledge/`).
- Do not add dependencies without documenting why existing facilities are insufficient.
- Do not create a new module without a corresponding `.knowledge/modules/<name>.md` entry in the plan.
- Do not design for hypothetical future requirements — solve the stated problem only.
- Do not read raw source files. Use `read_knowledge_base` and `search_knowledge` only. Source is for the compiler; `.knowledge/` is for agents.
- Do not skip `write_plan`. Describing a plan in conversation without calling `write_plan` is not a plan.

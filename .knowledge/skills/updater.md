---
module: skills/updater
updated: 2026-04-28
files: []
---

## Purpose
Instructions for updating `.knowledge/` module files after source code changes. Called by the `update_knowledge` MCP tool or the `knowledge-mcp update` CLI command.

## When to update a module doc

Update when:
- A function signature in the module changes (added param, changed return type).
- A new constraint is discovered or an existing one is removed.
- A significant usage pattern is added or changed.
- New source files are added to the module.
- The module is split or merged with another.

Do **not** update for pure internal refactors that leave the module's external interface and behavior unchanged.

## How to update

1. Read the current `.knowledge/modules/<module>.md` to understand the existing doc.
2. Read the changed source files listed in `## Files` plus any newly added files.
3. Identify exactly what changed: interfaces, patterns, constraints, file list.
4. Rewrite only the affected sections. Copy unchanged sections verbatim.
5. Update the `updated:` frontmatter date to today.
6. Call `update_knowledge(module: '<name>', changed_files: ['...'])` to persist the updated doc.

## After updating

Verify: does the `## Interfaces` section still reflect current exported function signatures exactly? If not, fix it before saving. After saving, the search engine will lazily rebuild the vector index on the next `search_knowledge` call.

## Format rules
- Keep each file under 400 words.
- `## Constraints` bullets must start with "Do not", "Never", or "Always".
- `## Interfaces` shows only exported symbols — no private helpers, no implementation details.
- Use triple-backtick code blocks with `typescript` language hint for all code.
- Frontmatter `files:` array lists only source files that are part of this module's implementation.

# Plan: Swift Project Type Support — Multi-Language Generation

## Context

When users run `generate_knowledge_base` on a Swift project, the knowledge base files are scaffolded but remain empty. The root cause is that `discoverSourceFiles` in `src/scaffold/index.ts` has a hardcoded list of supported file extensions (`['.ts', '.js', '.py', '.go', '.rs', '.java', '.cpp', '.c']`) that doesn't include `.swift`. Additionally, the Claude prompt has no language context, so even if files were found, the generation would lack ecosystem awareness.

**Solution**: Detect project type automatically from root marker files, apply language-specific profiles (extensions, skip dirs, language hints), and inject those hints into Claude's system prompt.

---

## Files to Modify

| File | Changes |
|---|---|
| `src/types.ts` | Add `ProjectType` union type and `ProjectProfile` interface |
| `src/scaffold/index.ts` | Add `detectProjectType`, `PROJECT_PROFILES` map, update `discoverSourceFiles` and `generateKnowledgeBase` |
| `src/cli/index.ts` | Add `--lang <type>` flag to `generate` command |
| `src/mcp/tools.ts` | Add optional `language` field to `generate_knowledge_base` tool schema |
| `.knowledge/modules/scaffold.md` | Document new types and functions |

---

## Implementation Details

### 1. `src/types.ts` — Add Project Type Definitions

Add these types at the end of the file:

```typescript
export type ProjectType =
  | 'swift'
  | 'node'
  | 'go'
  | 'rust'
  | 'python'
  | 'java'
  | 'cpp'
  | 'generic';

export interface ProjectProfile {
  extensions: string[];
  skipDirs: string[];
  defaultSourceDirs: string[];
  languageHint: string;
}
```

### 2. `src/scaffold/index.ts` — Core Changes

**2a. Define `PROJECT_PROFILES` map** at the top of the file (after imports):

```typescript
const PROJECT_PROFILES: Record<ProjectType, ProjectProfile> = {
  swift: {
    extensions: ['.swift', '.h', '.hpp'],
    skipDirs: ['DerivedData', '.build', 'Pods', '.swiftpm', 'Build'],
    defaultSourceDirs: ['Sources', '.'],
    languageHint: 'This is a Swift/iOS project. Note UIKit/SwiftUI patterns, protocols, delegates, package manager (SPM) structure.',
  },
  node: {
    extensions: ['.ts', '.js', '.mjs'],
    skipDirs: ['node_modules', 'dist', 'build', '.next', '.nuxt'],
    defaultSourceDirs: ['src', '.'],
    languageHint: 'This is a TypeScript/Node.js project. Note module exports, async patterns, and framework conventions.',
  },
  go: {
    extensions: ['.go'],
    skipDirs: ['vendor', 'build', 'dist'],
    defaultSourceDirs: ['pkg', 'cmd', 'internal', '.'],
    languageHint: 'This is a Go project. Note package structure, interfaces, error handling idioms.',
  },
  rust: {
    extensions: ['.rs'],
    skipDirs: ['target', 'build'],
    defaultSourceDirs: ['src', '.'],
    languageHint: 'This is a Rust project. Note ownership, trait patterns, crate structure, and Cargo conventions.',
  },
  python: {
    extensions: ['.py'],
    skipDirs: ['.venv', 'venv', '__pycache__', '.tox', 'build', 'dist', '.egg-info'],
    defaultSourceDirs: ['src', '.'],
    languageHint: 'This is a Python project. Note class hierarchies, decorators, module organization.',
  },
  java: {
    extensions: ['.java', '.kt'],
    skipDirs: ['build', 'target', '.gradle', '.m2'],
    defaultSourceDirs: ['src', 'src/main/java', '.'],
    languageHint: 'This is a JVM project (Java/Kotlin). Note class hierarchies, interfaces, and build conventions.',
  },
  cpp: {
    extensions: ['.cpp', '.c', '.h', '.hpp', '.cc', '.cxx'],
    skipDirs: ['build', 'cmake-build-*', 'dist', 'obj'],
    defaultSourceDirs: ['src', 'include', '.'],
    languageHint: 'This is a C/C++ project. Note header/implementation split, build system conventions.',
  },
  generic: {
    extensions: ['.ts', '.js', '.mjs', '.py', '.go', '.rs', '.java', '.kt', '.cpp', '.c', '.h', '.hpp', '.swift'],
    skipDirs: ['node_modules', 'dist', 'build', '__pycache__', 'target', '.venv', 'Pods', '.build'],
    defaultSourceDirs: ['src', '.'],
    languageHint: 'Analyze source code structure, patterns, and module organization.',
  },
};
```

**2b. Add `detectProjectType` function**:

```typescript
export async function detectProjectType(projectDir: string): Promise<ProjectType> {
  try {
    const entries = await readdir(projectDir);
    const entrySet = new Set(entries);

    // Check for Swift
    if (entrySet.has('Package.swift') || entries.some(e => e.endsWith('.xcodeproj') || e.endsWith('.xcworkspace'))) {
      return 'swift';
    }
    // Check for Go
    if (entrySet.has('go.mod')) return 'go';
    // Check for Rust
    if (entrySet.has('Cargo.toml')) return 'rust';
    // Check for Node
    if (entrySet.has('package.json')) return 'node';
    // Check for Python
    if (entrySet.has('requirements.txt') || entrySet.has('setup.py') || entrySet.has('pyproject.toml')) {
      return 'python';
    }
    // Check for Java
    if (entrySet.has('pom.xml') || entrySet.has('build.gradle') || entries.some(e => e.endsWith('.gradle.kts'))) {
      return 'java';
    }
    // Check for C/C++
    if (entrySet.has('CMakeLists.txt') || entrySet.has('Makefile')) {
      return 'cpp';
    }

    return 'generic';
  } catch {
    return 'generic';
  }
}
```

**2c. Update `discoverSourceFiles` signature**:

Change from:
```typescript
export async function discoverSourceFiles(dirs: string[]): Promise<string[]>
```

To:
```typescript
export async function discoverSourceFiles(dirs: string[], profile: ProjectProfile): Promise<string[]>
```

Inside the function, replace hardcoded constants:
- `const SUPPORTED_EXTENSIONS = new Set(...)` → `const SUPPORTED_EXTENSIONS = new Set(profile.extensions);`
- `const SKIP_DIRS = new Set(...)` → `const SKIP_DIRS = new Set(profile.skipDirs);`

The rest of the function remains unchanged.

**2d. Update `generateKnowledgeBase` signature**:

Change from:
```typescript
export async function generateKnowledgeBase(projectDir: string, sourceDirs: string[], config: Config): Promise<void>
```

To:
```typescript
export async function generateKnowledgeBase(
  projectDir: string,
  sourceDirs: string[],
  config: Config,
  languageOverride?: ProjectType
): Promise<void>
```

At the start of the function, add:
```typescript
const projectType = languageOverride || await detectProjectType(projectDir);
const profile = PROJECT_PROFILES[projectType];
```

Pass `profile` to `discoverSourceFiles`:
```typescript
// Old: const sourceFiles = await discoverSourceFiles(sourceDirs);
// New:
const sourceFiles = await discoverSourceFiles(sourceDirs, profile);
```

When building the Claude system prompt, inject the language hint:
```typescript
const systemPrompt = `You are analyzing a software project to generate knowledge base documentation.
${profile.languageHint}

Generate structured documentation following this template...`;
```

### 3. `src/cli/index.ts` — Add Language Flag

Update the `generate` command definition to accept a `--lang` flag:

```typescript
program
  .command('generate')
  .description('Generate knowledge base from source code')
  .option('--src <dirs...>', 'Source directories to analyze', ['src'])
  .option('--lang <type>', 'Force project type (swift|node|go|rust|python|java|cpp|generic)')
  .action(async (options) => {
    const languageOverride = options.lang as ProjectType | undefined;
    await generateKnowledgeBase(process.cwd(), options.src, config, languageOverride);
  });
```

### 4. `src/mcp/tools.ts` — Add Language Field to Tool Schema

In the `generate_knowledge_base` tool registration, add to the input schema:

```typescript
// In the CallToolRequestSchema for generate_knowledge_base:
"language": {
  "type": "string",
  "enum": ["swift", "node", "go", "rust", "python", "java", "cpp", "generic"],
  "description": "Force project type. If omitted, auto-detected from project root."
}
```

In the handler, extract and pass the language:
```typescript
const input = GenerateKnowledgeBaseInputSchema.parse(request.params.arguments);
const languageOverride = input.language as ProjectType | undefined;
await generateKnowledgeBase(cwd, input.sourceDirs || ['src'], config, languageOverride);
```

### 5. `.knowledge/modules/scaffold.md` — Update Documentation

Update the `## Interfaces` section to include:
- `ProjectType` type definition
- `ProjectProfile` interface definition
- New `detectProjectType` function signature
- Updated `discoverSourceFiles` and `generateKnowledgeBase` signatures

Add a decision: "Detection only checks project root — no recursive traversal of the entire project tree."

---

## Verification Steps

1. **Type checking**: `npm run typecheck` — all type errors resolved
2. **Build**: `npm run build` — compiles to `dist/` with executable permissions
3. **Node project** (current repo): `knowledge-mcp generate` auto-detects as `'node'`, behavior identical to today
4. **Swift project** (if available):
   - Auto-detection finds `Package.swift` → selects `swift` profile
   - `discoverSourceFiles` includes `.swift` files
   - Claude prompt includes Swift-specific hints
   - Generated `.knowledge/architecture.md` mentions UIKit/SwiftUI patterns
5. **Manual override**: `knowledge-mcp generate --lang swift` works in any project
6. **MCP tool**: Call `generate_knowledge_base` with `{ "language": "swift" }` → override works

---

## Success Criteria

- ✓ All 5 files modified and type-checked
- ✓ `detectProjectType` correctly identifies project type from marker files
- ✓ `discoverSourceFiles` respects profile extensions and skip dirs
- ✓ Claude receives `languageHint` in system prompt
- ✓ CLI flag `--lang <type>` works for manual override
- ✓ MCP tool accepts optional `language` field
- ✓ Knowledge files generated for Swift include Swift-specific content
- ✓ No breaking changes: existing `generateKnowledgeBase()` calls still work (use `generic` profile as default)

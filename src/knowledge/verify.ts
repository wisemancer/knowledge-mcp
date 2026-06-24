import { access } from "fs/promises";
import { constants } from "fs";
import { join, resolve, relative } from "path";
import {
  type KnowledgeFile,
  type KnowledgeFinding,
  type KnowledgeLayer,
  type KnowledgeVerifyReport,
} from "../types.js";
import { readKnowledgeBase } from "./reader.js";

// Valid epistemic markers (see modules/knowledge-standard).
const KNOWN_MARKERS = new Set([
  "EXPLICIT",
  "INFERRED:strong",
  "INFERRED:weak",
  "INFERRED",
  "ASSUMED",
  "MISSING_INFO",
]);

// A bracketed token shaped like a marker: starts uppercase, optional ":lowercase" suffix.
const MARKER_SHAPE = /\[([A-Z][A-Z0-9_]*(?::[a-z]+)?)\]/g;
// A path-like token used to validate [EXPLICIT] citations and detect staleness.
const PATH_TOKEN = /\b[\w./-]+\.[a-z]{1,6}(?::\d+)?\b/g;

function inferLayer(relPath: string): KnowledgeLayer | undefined {
  if (relPath.startsWith("canonical/")) return "canonical";
  if (relPath.startsWith("derived/")) return "derived";
  if (relPath.startsWith("meta/")) return "meta";
  if (relPath.startsWith("skills/")) return "skill";
  return undefined;
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function checkFile(
  file: KnowledgeFile,
  projectDir: string,
  relPath: string,
): Promise<KnowledgeFinding[]> {
  const findings: KnowledgeFinding[] = [];
  const add = (severity: "BLOCK" | "FLAG", code: string, message: string) =>
    findings.push({ file: relPath, severity, code, message });

  const layer = file.layer ?? inferLayer(relPath);
  const lines = file.content.split("\n");

  // Unknown-marker shape check on claim-bearing files only (meta/skill legitimately
  // contain marker names as legend text).
  const claimBearing = layer === "canonical" || layer === "derived";

  if (claimBearing) {
    // Frontmatter completeness.
    if (!file.layer) add("FLAG", "FRONTMATTER", "Missing `layer:` frontmatter on a canonical/derived file.");
    if (!file.tier) add("FLAG", "FRONTMATTER", "Missing `tier:` frontmatter (the marker ceiling).");

    const tier = file.tier;
    const ceilingT12 = tier === "T1" || tier === "T2";

    let explicitCount = 0;
    let inferredCount = 0;
    const missingCites = new Set<string>();

    let inFence = false;
    for (const line of lines) {
      // Fenced code blocks are examples/diagrams, not claims.
      if (/^\s*```/.test(line)) { inFence = !inFence; continue; }
      if (inFence) continue;
      // Blockquote lines are legends/notes, not claims.
      if (line.trim().startsWith(">")) continue;

      // A marker wrapped in inline code (`[EXPLICIT]`) is a *reference* to the token, not a
      // live claim — strip inline-code spans before detecting claim markers.
      const prose = line.replace(/`[^`]*`/g, " ");

      // Unknown markers (on prose only).
      for (const m of prose.matchAll(MARKER_SHAPE)) {
        if (!KNOWN_MARKERS.has(m[1])) add("FLAG", "MARKER", `Unknown marker token \`[${m[1]}]\`.`);
      }

      const hasExplicit = prose.includes("[EXPLICIT]");
      const hasInferredStrong = prose.includes("[INFERRED:strong]");
      if (hasExplicit) explicitCount++;
      if (/\[INFERRED(:strong|:weak)?\]/.test(prose) || prose.includes("[ASSUMED]")) inferredCount++;

      // Tier ceiling (BLOCK).
      if (hasExplicit && tier && !ceilingT12)
        add("BLOCK", "TIER", `[EXPLICIT] claim in a ${tier} file (requires T1/T2): "${line.trim().slice(0, 80)}"`);
      if (hasInferredStrong && tier && !ceilingT12)
        add("BLOCK", "TIER", `[INFERRED:strong] in a ${tier} file (requires T2+): "${line.trim().slice(0, 80)}"`);

      // KG3 citation (BLOCK): every [EXPLICIT] line needs a path-like token.
      if (hasExplicit) {
        const cites = line.match(PATH_TOKEN) ?? [];
        if (cites.length === 0)
          add("BLOCK", "KG3", `[EXPLICIT] without a path/path:line citation: "${line.trim().slice(0, 80)}"`);
        // KG6 staleness: cited file must exist.
        for (const c of cites) {
          const rel = c.replace(/:\d+$/, "");
          if (rel.includes("*")) continue;
          if (!(await pathExists(join(resolve(projectDir), rel)))) missingCites.add(rel);
        }
      }
    }

    // KG4 marker inflation.
    const totalMarked = explicitCount + inferredCount;
    if (totalMarked >= 5 && (inferredCount === 0 || explicitCount === 0))
      add(
        "FLAG",
        "KG4",
        `Marker inflation: ${explicitCount} [EXPLICIT] vs ${inferredCount} [INFERRED/ASSUMED] — distribution looks mechanical.`,
      );

    for (const m of missingCites) add("FLAG", "KG6", `Citation points at a file that does not exist: \`${m}\`.`);
  }

  // KG6 staleness: frontmatter `files:` entries that no longer exist (all layers).
  for (const f of file.files) {
    if (f.includes("*")) continue;
    if (!(await pathExists(join(resolve(projectDir), f))))
      add("FLAG", "KG6", `Frontmatter \`files:\` lists a missing path: \`${f}\`.`);
  }

  return findings;
}

export async function verifyKnowledge(projectDir: string): Promise<KnowledgeVerifyReport> {
  const files = await readKnowledgeBase(projectDir);
  const kDir = join(resolve(projectDir), ".knowledge");
  const findings: KnowledgeFinding[] = [];

  for (const file of files) {
    const relPath = relative(kDir, file.path);
    try {
      findings.push(...(await checkFile(file, projectDir, relPath)));
    } catch (err) {
      findings.push({
        file: relPath,
        severity: "FLAG",
        code: "PARSE",
        message: `Could not verify file: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  return {
    pass: findings.every((f) => f.severity !== "BLOCK"),
    filesChecked: files.length,
    findings,
  };
}

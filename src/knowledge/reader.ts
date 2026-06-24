import { readFile, readdir, stat } from 'fs/promises';
import { join, resolve } from 'path';
import { type KnowledgeFile, type KnowledgeLayer, type SourceTier } from '../types.js';

const LAYERS: KnowledgeLayer[] = ['canonical', 'derived', 'meta', 'skill'];
const TIERS: SourceTier[] = ['T1', 'T2', 'T3', 'T4'];

export function parseKnowledgeFile(raw: string, filePath: string): KnowledgeFile {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { module: '', updated: '', files: [], content: raw.trim(), path: filePath };

  const [, fm, body] = match;
  const get = (key: string) => fm.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))?.[1]?.trim() ?? '';
  const filesRaw = fm.match(/^files:\s*\[([^\]]*)\]$/m)?.[1] ?? '';
  const files = filesRaw
    ? filesRaw.split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
    : [];

  const layerRaw = get('layer');
  const tierRaw = get('tier');
  const layer = LAYERS.includes(layerRaw as KnowledgeLayer) ? (layerRaw as KnowledgeLayer) : undefined;
  const tier = TIERS.includes(tierRaw as SourceTier) ? (tierRaw as SourceTier) : undefined;

  return {
    module: get('module'),
    updated: get('updated'),
    files,
    ...(layer ? { layer } : {}),
    ...(tier ? { tier } : {}),
    content: body.trim(),
    path: filePath,
  };
}

async function walkDir(dir: string): Promise<string[]> {
  const results: string[] = [];
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return results;
  }
  for (const entry of entries) {
    if (entry === '.index.json' || entry.startsWith('.index.json.')) continue;
    const full = join(dir, entry);
    const s = await stat(full);
    if (s.isDirectory()) results.push(...await walkDir(full));
    else if (entry.endsWith('.md')) results.push(full);
  }
  return results;
}

export async function readKnowledgeBase(projectDir: string, module?: string): Promise<KnowledgeFile[]> {
  const kDir = join(resolve(projectDir), '.knowledge');
  const paths = await walkDir(kDir);
  const files = await Promise.all(
    paths.map(async p => parseKnowledgeFile(await readFile(p, 'utf-8'), p))
  );
  if (!module) return files;
  return files.filter(f => f.module === module || f.module.endsWith(`/${module}`));
}

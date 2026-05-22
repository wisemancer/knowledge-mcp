import { readFile, writeFile, rename } from 'fs/promises';
import { join, resolve } from 'path';
import { type VectorEntry, type VectorIndex } from '../types.js';

const INDEX_FILENAME = '.index.json';

function indexPath(projectDir: string): string {
  return join(resolve(projectDir), '.knowledge', INDEX_FILENAME);
}

export async function loadIndex(projectDir: string): Promise<VectorIndex> {
  try {
    const raw = await readFile(indexPath(projectDir), 'utf-8');
    return JSON.parse(raw) as VectorIndex;
  } catch {
    return { version: 1, entries: [] };
  }
}

export async function saveIndex(projectDir: string, index: VectorIndex): Promise<void> {
  const path = indexPath(projectDir);
  const tmp = path + '.tmp';
  await writeFile(tmp, JSON.stringify(index, null, 2), 'utf-8');
  await rename(tmp, path);
}

export function upsertEntries(index: VectorIndex, entries: VectorEntry[]): VectorIndex {
  const map = new Map(index.entries.map(e => [e.id, e]));
  for (const entry of entries) map.set(entry.id, entry);
  return { version: 1, entries: Array.from(map.values()) };
}

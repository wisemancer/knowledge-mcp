import { stat } from 'fs/promises';
import { join, resolve } from 'path';
import { type Config, type SearchResult, type VectorEntry } from '../types.js';
import { readKnowledgeBase } from '../knowledge/reader.js';
import { createOllamaClient } from '../ollama/client.js';
import { loadIndex, saveIndex, upsertEntries } from './vector-store.js';

function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]+`/g, ' ')
    .replace(/[#*_~>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function chunkFile(file: { module: string; content: string }): Array<{ module: string; section: string; text: string }> {
  // Split on ## headings (keep heading in chunk)
  const parts = file.content.split(/(?=^## )/m);
  return parts
    .map(part => {
      const headingMatch = part.match(/^## (.+)/m);
      const heading = headingMatch?.[1]?.trim() ?? 'Overview';
      return { module: file.module, section: heading, text: stripMarkdown(part) };
    })
    .filter(c => c.text.length > 20);
}

async function isIndexStale(projectDir: string): Promise<boolean> {
  const idxPath = join(resolve(projectDir), '.knowledge', '.index.json');
  let idxMtime: number;
  try {
    idxMtime = (await stat(idxPath)).mtimeMs;
  } catch {
    return true;
  }
  const files = await readKnowledgeBase(projectDir);
  for (const f of files) {
    if ((await stat(f.path)).mtimeMs > idxMtime) return true;
  }
  return false;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] ** 2;
    nb += b[i] ** 2;
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-10);
}

export async function rebuildIndex(projectDir: string, config: Config): Promise<void> {
  const ollama = createOllamaClient(config);
  const files = await readKnowledgeBase(projectDir);
  const chunks = files.flatMap(chunkFile);
  const entries: VectorEntry[] = await Promise.all(
    chunks.map(async chunk => ({
      id: `${chunk.module}::${chunk.section}`,
      module: chunk.module,
      section: chunk.section,
      text: chunk.text,
      embedding: await ollama.embed(chunk.text),
    }))
  );
  await saveIndex(projectDir, upsertEntries({ version: 1, entries: [] }, entries));
}

export async function searchKnowledge(
  projectDir: string,
  query: string,
  topK: number,
  config: Config,
): Promise<SearchResult[]> {
  if (await isIndexStale(projectDir)) await rebuildIndex(projectDir, config);
  const index = await loadIndex(projectDir);
  const ollama = createOllamaClient(config);
  const qVec = await ollama.embed(query);
  const scored: SearchResult[] = index.entries.map(e => ({
    module: e.module,
    section: e.section,
    text: e.text,
    score: cosineSimilarity(qVec, e.embedding),
  }));
  return scored.sort((a, b) => b.score - a.score).slice(0, topK);
}

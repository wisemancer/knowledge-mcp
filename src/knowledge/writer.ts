import { mkdir, writeFile } from 'fs/promises';
import { dirname, join, resolve } from 'path';
import { type KnowledgeMeta } from '../types.js';

export function formatKnowledgeFile(meta: KnowledgeMeta, body: string): string {
  const filesStr = `[${meta.files.map(f => `"${f}"`).join(', ')}]`;
  return `---\nmodule: ${meta.module}\nupdated: ${meta.updated}\nfiles: ${filesStr}\n---\n\n${body.trim()}\n`;
}

export async function writeKnowledgeFile(projectDir: string, relativePath: string, content: string): Promise<void> {
  const fullPath = join(resolve(projectDir), '.knowledge', relativePath);
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, content, 'utf-8');
}

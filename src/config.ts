import { readFile } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';
import { ConfigSchema, type Config } from './types.js';

export function getConfigPath(): string {
  return process.env['KNOWLEDGE_MCP_CONFIG'] ?? join(homedir(), '.knowledge-mcp', 'config.json');
}

export async function loadConfig(): Promise<Config> {
  try {
    const raw = await readFile(getConfigPath(), 'utf-8');
    return ConfigSchema.parse(JSON.parse(raw));
  } catch {
    return ConfigSchema.parse({});
  }
}

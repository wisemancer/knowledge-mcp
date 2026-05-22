import { KnowledgeError, type Config } from '../types.js';

export interface OllamaClient {
  embed(text: string): Promise<number[]>;
  generate(prompt: string): Promise<string>;
}

export function createOllamaClient(config: Config): OllamaClient {
  const base = config.ollama_host.replace(/\/$/, '');

  async function post(path: string, body: unknown, timeoutMs: number): Promise<unknown> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(`${base}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      return res.json();
    } catch (e) {
      throw new KnowledgeError('OLLAMA_UNAVAILABLE', `Ollama request to ${path} failed: ${e}`);
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async embed(text: string): Promise<number[]> {
      const data = await post('/api/embeddings', { model: config.embed_model, prompt: text }, 30_000);
      return (data as { embedding: number[] }).embedding;
    },
    async generate(prompt: string): Promise<string> {
      const data = await post('/api/generate', { model: config.ollama_model, prompt, stream: false }, 120_000);
      return (data as { response: string }).response;
    },
  };
}

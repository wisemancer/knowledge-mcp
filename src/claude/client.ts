import Anthropic from '@anthropic-ai/sdk';
import { KnowledgeError, type Config } from '../types.js';

export interface ClaudeClient {
  generate(prompt: string, systemPrompt?: string): Promise<string>;
}

export function createClaudeClient(config: Config): ClaudeClient | null {
  if (!config.anthropic_api_key) {
    return null;
  }
  const client = new Anthropic({ apiKey: config.anthropic_api_key });

  return {
    async generate(prompt: string, systemPrompt?: string): Promise<string> {
      const msg = await client.messages.create({
        model: config.claude_model,
        max_tokens: 8192,
        ...(systemPrompt ? { system: systemPrompt } : {}),
        messages: [{ role: 'user', content: prompt }],
      });
      const block = msg.content[0];
      if (!block || block.type !== 'text') {
        throw new KnowledgeError('CLAUDE_UNAVAILABLE', 'Unexpected response type from Claude');
      }
      return block.text;
    },
  };
}

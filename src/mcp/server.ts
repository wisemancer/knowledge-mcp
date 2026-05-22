import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { type Config } from '../types.js';
import { registerTools } from './tools.js';

export async function startServer(config: Config): Promise<void> {
  const cwd = process.cwd();
  const server = new Server(
    { name: 'knowledge-mcp', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );
  registerTools(server, config, cwd);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

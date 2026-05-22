#!/usr/bin/env node
import { loadConfig } from './config.js';
import { startServer } from './mcp/server.js';
import { runCLI } from './cli/index.js';

const config = await loadConfig();
const arg = process.argv[2];

if (!arg || arg === 'serve') {
  await startServer(config);
} else {
  await runCLI(config, process.argv);
}

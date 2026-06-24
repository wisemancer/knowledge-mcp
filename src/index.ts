#!/usr/bin/env node
import { startServer } from "./mcp/server.js";
import { runCLI } from "./cli/index.js";

async function main(): Promise<void> {
  const arg = process.argv[2];
  if (!arg || arg === 'serve' || arg === 'server') {
    await startServer();
  } else {
    await runCLI(process.argv.slice(2));
  }
}

main();

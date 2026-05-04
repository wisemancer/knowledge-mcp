#!/usr/bin/env node
import { loadConfig } from "./config.js";
import { startServer } from "./mcp/server.js";
import { runCLI } from "./cli/index.js";

async function main(): Promise<void> {
  const config = await loadConfig();
  if (process.argv[2] === "server") {
    await startServer(config);
  } else {
    await runCLI(config, process.argv.slice(2));
  }
}

main();

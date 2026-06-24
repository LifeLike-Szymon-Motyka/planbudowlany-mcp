#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { loadConfig } from './config.js'
import { TokenManager } from './auth.js'
import { ApiClient } from './apiClient.js'
import { buildServer } from './server.js'

async function main(): Promise<void> {
  const config = loadConfig()
  const tokens = new TokenManager(config)
  const api = new ApiClient({ apiUrl: config.apiUrl }, tokens)

  const server = buildServer(api)

  const transport = new StdioServerTransport()
  await server.connect(transport)
}

// This module is only ever loaded as the CLI entry point (the `planbudowlany-mcp` bin),
// so it always runs. Tests import the server wiring from ./server.js, never this file,
// which avoids the fragile import.meta.url-vs-argv guard that broke symlinked npx launches.
main().catch((err) => {
  // stderr only — stdout is the MCP transport and must stay clean
  process.stderr.write(`[planbudowlany-mcp] fatal: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
})

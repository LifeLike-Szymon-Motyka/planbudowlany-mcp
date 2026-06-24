#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { loadConfig } from './config.js'
import { TokenManager } from './auth.js'
import { ApiClient } from './apiClient.js'
import { registerWorkspaceTools } from './tools/workspace.js'
import { registerTaskTools } from './tools/tasks.js'
import { registerCostTools } from './tools/costs.js'
import { registerIssueTools } from './tools/issues.js'
import { registerDiaryTools } from './tools/diary.js'
import { registerTimelineTools } from './tools/timeline.js'

export function registerAllTools(server: McpServer, api: ApiClient): void {
  registerWorkspaceTools(server, api)
  registerTaskTools(server, api)
  registerCostTools(server, api)
  registerIssueTools(server, api)
  registerDiaryTools(server, api)
  registerTimelineTools(server, api)
}

async function main(): Promise<void> {
  const config = loadConfig()
  const tokens = new TokenManager(config)
  const api = new ApiClient({ apiUrl: config.apiUrl }, tokens)

  const server = new McpServer({ name: 'planbudowlany', version: '0.1.0' })
  registerAllTools(server, api)

  const transport = new StdioServerTransport()
  await server.connect(transport)
}

// Only run when executed directly (not when imported by tests)
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))
if (isMain) {
  main().catch((err) => {
    process.stderr.write(`[planbudowlany-mcp] fatal: ${err instanceof Error ? err.message : String(err)}\n`)
    process.exit(1)
  })
}

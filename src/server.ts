import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ApiClient } from './apiClient.js'
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

export function buildServer(api: ApiClient): McpServer {
  const server = new McpServer({ name: 'planbudowlany', version: '0.21.37' })
  registerAllTools(server, api)
  return server
}

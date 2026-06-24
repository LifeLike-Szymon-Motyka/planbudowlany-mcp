import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ApiClient } from '../apiClient.js'
import type { WorkspaceInfo } from '../types.js'
import { registerJsonTool } from './register.js'

export function registerWorkspaceTools(server: McpServer, api: ApiClient): void {
  registerJsonTool(
    server,
    'get_workspace_info',
    {
      title: 'Get workspace info',
      description:
        'Returns the current construction project (workspace): name, default currency, total budget, ' +
        'task count and members with their roles. Call this first to understand the project context.',
      inputSchema: {}
    },
    async () => api.get<WorkspaceInfo>('/user/workspace/details')
  )
}

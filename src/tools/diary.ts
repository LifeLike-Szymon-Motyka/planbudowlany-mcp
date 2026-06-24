import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ApiClient } from '../apiClient.js'
import type { ActivityFeed } from '../types.js'
import { registerJsonTool } from './register.js'

export function registerDiaryTools(server: McpServer, api: ApiClient): void {
  registerJsonTool(
    server,
    'list_activity',
    {
      title: 'List recent activity',
      description:
        'Returns the project activity feed ("Historia Budowy") newest-first: who did what and when ' +
        '(tasks, costs, files, issues, members). Use "before" (an ISO-8601 cursor from a previous nextCursor) ' +
        'to page back in time. Optionally filter by categories.',
      inputSchema: {
        categories: z
          .array(z.enum(['system', 'member', 'task', 'cost', 'file', 'issue']))
          .optional()
          .describe('Restrict to these categories'),
        before: z.string().optional().describe('ISO-8601 UTC cursor — entries strictly older than this'),
        limit: z.number().int().positive().max(100).optional()
      }
    },
    async (a) => {
      const q = new URLSearchParams()
      if (Array.isArray(a.categories) && a.categories.length) q.set('category', (a.categories as string[]).join(','))
      if (a.before) q.set('before', a.before as string)
      if (a.limit) q.set('limit', String(a.limit))
      const qs = q.toString()
      return api.get<ActivityFeed>(`/user/diary/activity${qs ? `?${qs}` : ''}`)
    }
  )
}

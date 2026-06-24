import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ApiClient } from '../apiClient.js'
import type { ProjectTimeline } from '../types.js'
import { registerJsonTool } from './register.js'

export function registerTimelineTools(server: McpServer, api: ApiClient): void {
  registerJsonTool(
    server,
    'get_timeline',
    {
      title: 'Get project timeline',
      description:
        'Returns the project schedule / Gantt data grouped by category: each task with start/end dates, ' +
        'progress %, status, dependency task IDs and dated subtasks. Use this to reason about the calendar, ' +
        'critical path or what is due when. Dates filter on the task window; withDone=false hides finished tasks.',
      inputSchema: {
        withDone: z.boolean().optional().describe('Include completed tasks (default true)'),
        startDate: z.string().optional().describe('ISO-8601 — only tasks on/after this date'),
        endDate: z.string().optional().describe('ISO-8601 — only tasks on/before this date')
      }
    },
    async (a) => {
      const q = new URLSearchParams()
      if (a.withDone !== undefined) q.set('withDone', String(a.withDone))
      if (a.startDate) q.set('startDate', a.startDate as string)
      if (a.endDate) q.set('endDate', a.endDate as string)
      const qs = q.toString()
      return api.get<ProjectTimeline>(`/user/workspace/timeline${qs ? `?${qs}` : ''}`)
    }
  )
}

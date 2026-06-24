import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ApiClient } from '../apiClient.js'
import type { IssueReportSummary, IssueReportDetail } from '../types.js'
import { registerJsonTool } from './register.js'

export function registerIssueTools(server: McpServer, api: ApiClient): void {
  registerJsonTool(
    server,
    'list_issues',
    {
      title: 'List issue reports',
      description:
        'Lists construction issue/defect reports ("usterki"). Each report groups issues for one task and ' +
        'shows total vs. open issue counts. Optionally filter by report status or task.',
      inputSchema: {
        status: z.enum(['draft', 'published', 'archived']).optional(),
        taskExternalId: z.string().uuid().optional(),
        page: z.number().int().positive().optional(),
        pageSize: z.number().int().positive().max(100).optional()
      }
    },
    async (a) => {
      const q = new URLSearchParams()
      if (a.status) q.set('status', a.status as string)
      if (a.taskExternalId) q.set('taskExternalId', a.taskExternalId as string)
      if (a.page) q.set('page', String(a.page))
      if (a.pageSize) q.set('pageSize', String(a.pageSize))
      const qs = q.toString()
      return api.get<IssueReportSummary[]>(`/user/issuereports${qs ? `?${qs}` : ''}`)
    }
  )

  registerJsonTool(
    server,
    'get_issue',
    {
      title: 'Get issue report',
      description: 'Returns one issue report in full, including every individual issue with its severity and status.',
      inputSchema: { reportExternalId: z.string().uuid() }
    },
    async (a) => api.get<IssueReportDetail>(`/user/issuereports/${a.reportExternalId as string}`)
  )

  registerJsonTool(
    server,
    'update_issue',
    {
      title: 'Update issue title and description',
      description:
        'Updates the title and/or description of a single issue inside an issue report. ' +
        'Both the report and issue external IDs are required. Pass null to clear the description.',
      inputSchema: {
        reportExternalId: z.string().uuid(),
        issueExternalId: z.string().uuid(),
        title: z.string().min(1).max(300),
        description: z.string().max(2000).nullable().optional()
      }
    },
    async (a) =>
      api.put<null>('/user/issuereports/issue', {
        reportExternalId: a.reportExternalId,
        issueExternalId: a.issueExternalId,
        title: a.title,
        description: a.description ?? null
      })
  )
}

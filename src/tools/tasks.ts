import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ApiClient } from '../apiClient.js'
import type { MainTaskDetail, SubtaskDto } from '../types.js'
import { registerJsonTool } from './register.js'

const STATUS = z.enum(['toDo', 'inProgress', 'done', 'delayed'])

export function registerTaskTools(server: McpServer, api: ApiClient): void {
  registerJsonTool(
    server,
    'list_tasks',
    {
      title: 'List tasks',
      description:
        'Lists the main tasks of the project. Optionally filter by status or only tasks assigned to the ' +
        'API-key owner. Returns title, status, dates, subtask counts and total cost per task.',
      inputSchema: {
        status: STATUS.optional().describe('Filter by task status'),
        assignedToMe: z.boolean().optional().describe('Only tasks assigned to the API-key owner'),
        page: z.number().int().positive().optional(),
        pageSize: z.number().int().positive().max(100).optional()
      }
    },
    async (a) => {
      const q = new URLSearchParams()
      if (a.status) q.set('statusFilter', a.status as string)
      if (a.assignedToMe) q.set('assignedToMe', 'true')
      if (a.page) q.set('page', String(a.page))
      if (a.pageSize) q.set('pageSize', String(a.pageSize))
      const qs = q.toString()
      return api.get<MainTaskDetail[]>(`/user/task${qs ? `?${qs}` : ''}`)
    }
  )

  registerJsonTool(
    server,
    'get_task',
    {
      title: 'Get task',
      description: 'Returns one main task in full detail, including its subtasks and dependency task IDs.',
      inputSchema: { taskExternalId: z.string().uuid().describe('The task externalId') }
    },
    async (a) => api.get<MainTaskDetail>(`/user/task/${a.taskExternalId as string}`)
  )

  registerJsonTool(
    server,
    'create_task',
    {
      title: 'Create task',
      description:
        'Creates a new main task. Only "title" is required. Dates are ISO-8601 (e.g. 2026-07-01). ' +
        'Status defaults to "toDo" if omitted.',
      inputSchema: {
        title: z.string().min(1).max(300),
        description: z.string().optional(),
        notes: z.string().optional(),
        status: STATUS.optional(),
        dueDate: z.string().optional().describe('ISO-8601 date'),
        beginDate: z.string().optional().describe('ISO-8601 date'),
        endDate: z.string().optional().describe('ISO-8601 date'),
        categoryExternalId: z.string().uuid().optional()
      }
    },
    async (a) => api.post<{ externalId: string; title: string }>('/user/task', a)
  )

  registerJsonTool(
    server,
    'update_task_status',
    {
      title: 'Update task status',
      description:
        'Changes a main task status. Set cascadeToSubtasks=true to also mark all subtasks done when ' +
        'moving the task to "done".',
      inputSchema: {
        taskExternalId: z.string().uuid(),
        status: STATUS,
        cascadeToSubtasks: z.boolean().optional()
      }
    },
    async (a) =>
      api.put<{ externalId: string; status: string; updatedAt: string }>('/user/task/status', a)
  )

  registerJsonTool(
    server,
    'create_subtask',
    {
      title: 'Create subtask',
      description: 'Creates a subtask under an existing main task. "parentTaskExternalId" and "title" are required.',
      inputSchema: {
        parentTaskExternalId: z.string().uuid(),
        title: z.string().min(1).max(300),
        description: z.string().optional(),
        notes: z.string().optional(),
        dueDate: z.string().optional().describe('ISO-8601 date')
      }
    },
    async (a) => api.post<SubtaskDto>('/user/task/subtask', a)
  )
}

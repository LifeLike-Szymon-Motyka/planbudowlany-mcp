import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ApiClient } from '../apiClient.js'
import type { CostItem, CostDashboard } from '../types.js'
import { registerJsonTool } from './register.js'

const CURRENCY = z.enum(['pln', 'eur', 'usd'])

export function registerCostTools(server: McpServer, api: ApiClient): void {
  registerJsonTool(
    server,
    'list_costs',
    {
      title: 'List costs',
      description:
        'Lists cost items. Without taskExternalId returns all costs in the project; with it, only costs ' +
        'attached to that task.',
      inputSchema: { taskExternalId: z.string().uuid().optional().describe('Filter to one task') }
    },
    async (a) =>
      a.taskExternalId
        ? api.get<CostItem[]>(`/user/cost/task/${a.taskExternalId as string}`)
        : api.get<CostItem[]>('/user/cost')
  )

  registerJsonTool(
    server,
    'get_cost_summary',
    {
      title: 'Get cost summary',
      description:
        'Budget vs. spend summary for the project: total budget, spent, remaining, paid/unpaid totals, ' +
        'whether the budget is exceeded, and a per-task cost breakdown. Optionally aggregate into a given currency.',
      inputSchema: { currency: CURRENCY.optional() }
    },
    async (a) =>
      api.get<CostDashboard>(`/user/Dashboard/cost${a.currency ? `?currency=${a.currency as string}` : ''}`)
  )

  registerJsonTool(
    server,
    'create_cost',
    {
      title: 'Create cost',
      description:
        'Adds a cost item to the project. IMPORTANT: every cost MUST be attached to a main task via ' +
        'mainTaskExternalId. If the user has not said which task the cost belongs to, FIRST call list_tasks ' +
        'and ask them to pick one — do not guess. amount must be > 0; currency is pln, eur or usd.',
      inputSchema: {
        name: z.string().min(1).max(200),
        amount: z.number().positive(),
        currency: CURRENCY,
        mainTaskExternalId: z.string().uuid().describe('REQUIRED — the task this cost belongs to'),
        paid: z.boolean().optional().describe('Whether the cost is already paid (default false)'),
        description: z.string().max(1000).optional(),
        link: z.string().max(500).optional()
      }
    },
    async (a) =>
      api.post<{ externalId: string; name: string; amount: number; currency: string; paid: boolean }>(
        '/user/cost',
        { paid: false, ...a }
      )
  )
}

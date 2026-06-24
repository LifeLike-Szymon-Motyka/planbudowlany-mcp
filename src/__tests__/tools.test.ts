import { describe, it, expect, vi } from 'vitest'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerAllTools } from '../server.js'

describe('registerAllTools', () => {
  it('registers every expected tool without throwing', () => {
    const server = new McpServer({ name: 'test', version: '0.0.0' })
    const api = { get: vi.fn(), post: vi.fn(), put: vi.fn() }
    const registered: string[] = []
    const spy = vi.spyOn(server, 'registerTool').mockImplementation(((name: string) => {
      registered.push(name)
      return undefined as never
    }) as never)

    registerAllTools(server, api as never)

    expect(registered).toEqual(
      expect.arrayContaining([
        'get_workspace_info',
        'list_tasks', 'get_task', 'create_task', 'update_task_status', 'create_subtask',
        'list_costs', 'get_cost_summary', 'create_cost',
        'list_issues', 'get_issue',
        'list_activity',
        'get_timeline'
      ])
    )
    expect(registered.length).toBe(13)
    spy.mockRestore()
  })
})

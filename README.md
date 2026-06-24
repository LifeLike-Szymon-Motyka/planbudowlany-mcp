# planbudowlany-mcp

MCP server for [Plan Budowlany](https://planbudowlany.online) — lets an MCP-capable agent (Claude Desktop, etc.) read and manage a construction project: tasks, subtasks, costs, issue reports, the activity diary and the schedule/Gantt timeline.

## Setup

1. In Plan Budowlany open **Ustawienia workspace → Klucze API** and generate a key (`pb_...`).
2. Add the server to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "planbudowlany": {
      "command": "npx",
      "args": ["planbudowlany-mcp"],
      "env": {
        "PB_API_KEY": "pb_your_key_here",
        "PB_API_URL": "https://api.planbudowlany.online"
      }
    }
  }
}
```

The key is scoped to one workspace; all tools operate on that project.

## Tools

| Tool | Purpose |
|---|---|
| `get_workspace_info` | Project name, currency, budget, members |
| `list_tasks` / `get_task` | Browse main tasks (filter by status / assigned-to-me) |
| `create_task` / `update_task_status` / `create_subtask` | Manage tasks |
| `list_costs` / `get_cost_summary` | Costs and budget-vs-spend summary |
| `create_cost` | Add a cost (must be attached to a task) |
| `list_issues` / `get_issue` | Construction issue/defect reports |
| `list_activity` | Project activity diary (newest first) |
| `get_timeline` | Schedule / Gantt data with dependencies |

## Development

```bash
npm install
npm test          # vitest
npm run build     # tsc -> dist/
```

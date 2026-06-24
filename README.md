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

## Usage examples

Once configured, just talk to your agent in natural language — it picks the right tools. Examples:

**Inspect the project**
> "What's my construction project budget and how much have I spent so far?"
→ `get_workspace_info` + `get_cost_summary`

> "Show me everything that's still in progress."
→ `list_tasks` with `status: inProgress`

**Create work**
> "Add a task 'Wylewka fundamentów' due 15 July, mark it as in progress."
→ `create_task { title, dueDate: "2026-07-15", status: "inProgress" }`

> "Under that task add a subtask 'Zamówić beton' for 10 July."
→ `create_subtask { parentTaskExternalId, title, dueDate }`

**Costs are always tied to a task.** If you don't say which task, the agent lists tasks and asks first:
> "Add a 4800 PLN cost for ready-mix concrete."
> → agent: "Which task should this cost belong to?" (calls `list_tasks`)
> "The foundations one."
→ `create_cost { name, amount: 4800, currency: "pln", mainTaskExternalId }`

**Track & report**
> "What changed in the project recently?"
→ `list_activity`

> "Give me the schedule for July — what's due and what depends on what."
→ `get_timeline { startDate: "2026-07-01", endDate: "2026-07-31" }`

> "Any open defects on the masonry task?"
→ `list_issues { taskExternalId }` + `get_issue`

### Notes

- **Workspace scope:** the API key is bound to one workspace; every tool operates on that project (you never pass a workspace id).
- **Enums:** task status is `toDo | inProgress | done | delayed`; currency is `pln | eur | usd`. Dates are ISO-8601 (`2026-07-15`).
- **Writes are audited:** every create/update is recorded in the project's construction diary, so `list_activity` reflects what the agent did.

## Development

```bash
npm install
npm test          # vitest
npm run build     # tsc -> dist/
```

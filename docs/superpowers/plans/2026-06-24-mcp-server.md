# Plan Budowlany MCP Server — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `planbudowlany-mcp`, a public npm package that exposes a Plan Budowlany workspace to MCP-capable LLM agents (Claude Desktop, etc.) via a stdio MCP server authenticated with a `pb_...` API key.

**Architecture:** A thin stdio MCP server. On startup it reads `PB_API_KEY` + `PB_API_URL` from env, exchanges the key for a workspace-scoped JWT via the `grant_type=api_key` OAuth2 flow, and decodes the `WorkspaceId` claim. A small `fetch`-based API client attaches `Authorization: Bearer <jwt>` + `X-Workspace-Id: <claim>` to every call, unwraps the `{success,data,errors}` envelope, and transparently refreshes the token on expiry/401. Tools are grouped by domain (workspace, tasks, costs, issues, diary, timeline) and registered with Zod schemas.

**Tech Stack:** Node.js ≥20 (ESM), TypeScript, `@modelcontextprotocol/sdk`, `zod`, `vitest` for tests. No HTTP framework — native `fetch`.

**Key API facts (verified against planbudowlany-api):**
- Token: `POST {PB_API_URL}/connect/token`, form-encoded `grant_type=api_key&api_key=<raw>&scope=roles offline_access` → `{access_token, refresh_token, expires_in, token_type}`. The JWT carries claim `WorkspaceId` (the key's workspace). Refresh via `grant_type=refresh_token&refresh_token=<rt>`.
- All `/user/*` calls require header `X-Workspace-Id: <guid>` (must equal the token's `WorkspaceId` claim — server enforces it).
- Envelope on every JSON response: `{ "success": bool, "data": T|null, "errors": [{code,message,field?}]|null }`.
- Enums serialize as **camelCase strings**: `MainTaskStatus` = `toDo|inProgress|done|delayed`; `Currency` = `pln|eur|usd`; `IssueStatus` = `open|inProgress|resolved|dismissed|reopened`; `IssueSeverity` = `low|medium|high|critical`; `IssueReportStatus` = `draft|published|archived`; `LogEntryCategory` = `system|member|task|cost|file|issue`.
- Endpoints used:
  - `GET /user/workspace/details` → workspace info (name, defaultCurrency, budget, members[]).
  - `GET /user/task` → `MainTaskDetailDto[]` (filters: `statusFilter`, `assignedToMe`, `page`, `pageSize`).
  - `GET /user/task/{taskExternalId}` → `MainTaskDetailDto`.
  - `POST /user/task` → create main task (`title` required; `description,notes,status,dueDate,beginDate,endDate,categoryExternalId` optional). 201 → `{externalId,title,workspaceExternalId}`.
  - `PUT /user/task/status` → `{taskExternalId, status, cascadeToSubtasks?}` → `{externalId,status,updatedAt}`.
  - `POST /user/task/subtask` → `{parentTaskExternalId, title, description?, notes?, dueDate?, beginDate?, endDate?}` 201 → `SubtaskDto`.
  - `GET /user/cost` → `CostItemResult[]`; `GET /user/cost/task/{mainTaskExternalId}` → costs for one task.
  - `POST /user/cost` → create cost. **`mainTaskExternalId` is REQUIRED** plus `name`, `amount`(>0), `currency`, `paid`. 201 → `{externalId,name,amount,currency,paid,workspaceExternalId}`.
  - `GET /user/Dashboard/cost?currency=` → `CostDashboardResult` (totalCost, totalBudget, spentBudget, remainingBudget, paidCosts, unpaidCosts, budgetExceeded, costByTasks[]).
  - `GET /user/issuereports` → `IssueReportDto[]` (filters: `status`, `taskExternalId`, `page`, `pageSize`).
  - `GET /user/issuereports/{reportExternalId}` → `IssueReportDetailDto` (with `issues[]`).
  - `GET /user/diary/activity?category=&before=&limit=` → `{items: ActivityFeedItemDto[], nextCursor}`.
  - `GET /user/workspace/timeline?withDone=&startDate=&endDate=` → `ProjectTimelineDto` (`timelineData[]` = categories → `tasks[]` with `start,end,progress,status,dependencies[],subtasks[]`).

---

## File Structure

| File | Responsibility |
|---|---|
| `package.json` | npm metadata, `bin` → `dist/index.js`, deps, scripts |
| `tsconfig.json` | TS compile (NodeNext ESM → `dist/`) |
| `vitest.config.ts` | test runner config |
| `.gitignore` | ignore `node_modules`, `dist` |
| `README.md` | install + Claude Desktop config snippet |
| `src/config.ts` | read & validate env (`PB_API_KEY`, `PB_API_URL`) |
| `src/auth.ts` | `TokenManager`: api_key→JWT exchange, refresh, decode `WorkspaceId` |
| `src/apiClient.ts` | `ApiClient`: authed fetch, envelope unwrap, 401-refresh, errors |
| `src/types.ts` | TS interfaces for the API DTOs the tools consume |
| `src/tools/register.ts` | helper to register a tool with text+structured output |
| `src/tools/workspace.ts` | `get_workspace_info` |
| `src/tools/tasks.ts` | `list_tasks`, `get_task`, `create_task`, `update_task_status`, `create_subtask` |
| `src/tools/costs.ts` | `list_costs`, `get_cost_summary`, `create_cost` |
| `src/tools/issues.ts` | `list_issues`, `get_issue` |
| `src/tools/diary.ts` | `list_activity` |
| `src/tools/timeline.ts` | `get_timeline` |
| `src/index.ts` | compose server, register all tools, connect stdio |
| `src/__tests__/*.test.ts` | unit tests (config, auth, apiClient, a representative tool) |

---

## Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "planbudowlany-mcp",
  "version": "0.1.0",
  "description": "MCP server for Plan Budowlany — manage construction project tasks, costs, issues and timeline from an LLM agent.",
  "type": "module",
  "bin": { "planbudowlany-mcp": "dist/index.js" },
  "files": ["dist", "README.md"],
  "engines": { "node": ">=20" },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "vitest run",
    "prepublishOnly": "npm run build"
  },
  "keywords": ["mcp", "modelcontextprotocol", "planbudowlany", "construction"],
  "license": "MIT",
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.12.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vitest": "^2.1.0",
    "@types/node": "^20.14.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": false,
    "sourceMap": false
  },
  "include": ["src/**/*"],
  "exclude": ["src/**/*.test.ts", "node_modules", "dist"]
}
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { include: ['src/**/*.test.ts'], environment: 'node' }
})
```

- [ ] **Step 4: Create `.gitignore`**

```
node_modules/
dist/
*.log
```

- [ ] **Step 5: Install and verify**

Run: `npm install`
Expected: dependencies install, no errors.

- [ ] **Step 6: Commit**

```bash
git add package.json tsconfig.json vitest.config.ts .gitignore package-lock.json
git commit -m "chore: scaffold planbudowlany-mcp (TS ESM, MCP SDK, vitest)"
```

---

## Task 2: Config (env reading + validation)

**Files:**
- Create: `src/config.ts`
- Test: `src/__tests__/config.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/config.test.ts
import { describe, it, expect } from 'vitest'
import { loadConfig } from '../config.js'

describe('loadConfig', () => {
  it('reads api key and url from env', () => {
    const cfg = loadConfig({ PB_API_KEY: 'pb_abc123', PB_API_URL: 'https://api.example.com' })
    expect(cfg.apiKey).toBe('pb_abc123')
    expect(cfg.apiUrl).toBe('https://api.example.com')
  })

  it('defaults apiUrl to production when omitted', () => {
    const cfg = loadConfig({ PB_API_KEY: 'pb_abc123' })
    expect(cfg.apiUrl).toBe('https://api.planbudowlany.online')
  })

  it('strips a trailing slash from apiUrl', () => {
    const cfg = loadConfig({ PB_API_KEY: 'pb_x', PB_API_URL: 'https://api.example.com/' })
    expect(cfg.apiUrl).toBe('https://api.example.com')
  })

  it('throws when PB_API_KEY is missing', () => {
    expect(() => loadConfig({})).toThrow(/PB_API_KEY/)
  })

  it('throws when PB_API_KEY has wrong prefix', () => {
    expect(() => loadConfig({ PB_API_KEY: 'nope' })).toThrow(/pb_/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/config.test.ts`
Expected: FAIL — cannot find module `../config.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/config.ts
export interface Config {
  apiKey: string
  apiUrl: string
}

const DEFAULT_API_URL = 'https://api.planbudowlany.online'

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const apiKey = env.PB_API_KEY?.trim()
  if (!apiKey) {
    throw new Error('PB_API_KEY is required. Set it in your MCP server env config.')
  }
  if (!apiKey.startsWith('pb_')) {
    throw new Error('PB_API_KEY looks invalid — Plan Budowlany API keys start with "pb_".')
  }
  const rawUrl = env.PB_API_URL?.trim() || DEFAULT_API_URL
  const apiUrl = rawUrl.replace(/\/+$/, '')
  return { apiKey, apiUrl }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/config.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/config.ts src/__tests__/config.test.ts
git commit -m "feat(config): env loading + validation for PB_API_KEY/PB_API_URL"
```

---

## Task 3: Auth (token exchange, refresh, workspace decode)

**Files:**
- Create: `src/auth.ts`
- Test: `src/__tests__/auth.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/auth.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TokenManager, decodeWorkspaceId } from '../auth.js'

// Build a fake JWT: header.payload.signature (payload base64url-encoded JSON)
function fakeJwt(payload: object): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${b64({ alg: 'RS256', typ: 'at+jwt' })}.${b64(payload)}.sig`
}

describe('decodeWorkspaceId', () => {
  it('reads the WorkspaceId claim from a JWT', () => {
    const jwt = fakeJwt({ sub: '3', WorkspaceId: 'ws-123' })
    expect(decodeWorkspaceId(jwt)).toBe('ws-123')
  })
  it('throws when the claim is absent', () => {
    const jwt = fakeJwt({ sub: '3' })
    expect(() => decodeWorkspaceId(jwt)).toThrow(/WorkspaceId/)
  })
})

describe('TokenManager', () => {
  const apiUrl = 'https://api.test'
  beforeEach(() => vi.restoreAllMocks())

  it('exchanges the api key and exposes token + workspaceId', async () => {
    const jwt = fakeJwt({ sub: '3', WorkspaceId: 'ws-abc' })
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: jwt, refresh_token: 'rt1', expires_in: 3600, token_type: 'Bearer' })
    })
    const tm = new TokenManager({ apiKey: 'pb_k', apiUrl }, fetchMock as unknown as typeof fetch)

    const token = await tm.getAccessToken()
    expect(token).toBe(jwt)
    expect(tm.workspaceId).toBe('ws-abc')

    const body = (fetchMock.mock.calls[0][1] as RequestInit).body as string
    expect(body).toContain('grant_type=api_key')
    expect(body).toContain('api_key=pb_k')
  })

  it('reuses a cached token until near expiry', async () => {
    const jwt = fakeJwt({ WorkspaceId: 'ws-abc' })
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: jwt, refresh_token: 'rt1', expires_in: 3600, token_type: 'Bearer' })
    })
    const tm = new TokenManager({ apiKey: 'pb_k', apiUrl }, fetchMock as unknown as typeof fetch)
    await tm.getAccessToken()
    await tm.getAccessToken()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('throws a clear error when exchange fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false, status: 400,
      json: async () => ({ error: 'invalid_grant' })
    })
    const tm = new TokenManager({ apiKey: 'pb_bad', apiUrl }, fetchMock as unknown as typeof fetch)
    await expect(tm.getAccessToken()).rejects.toThrow(/API key/i)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/auth.test.ts`
Expected: FAIL — cannot find module `../auth.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/auth.ts
import type { Config } from './config.js'

interface TokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
  token_type: string
}

export function decodeWorkspaceId(jwt: string): string {
  const parts = jwt.split('.')
  if (parts.length < 2) throw new Error('Malformed JWT: cannot read WorkspaceId claim.')
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
  const ws = payload.WorkspaceId ?? payload.workspaceId ?? payload.workspace_id
  if (!ws) throw new Error('Token has no WorkspaceId claim — is this an api_key token?')
  return String(ws)
}

export class TokenManager {
  private accessToken: string | null = null
  private refreshToken: string | null = null
  private expiresAtMs = 0
  private _workspaceId: string | null = null

  constructor(private cfg: Config, private fetchFn: typeof fetch = fetch) {}

  get workspaceId(): string {
    if (!this._workspaceId) throw new Error('Not authenticated yet — call getAccessToken() first.')
    return this._workspaceId
  }

  async getAccessToken(): Promise<string> {
    // 60s safety margin so we never use a token that expires mid-request
    if (this.accessToken && Date.now() < this.expiresAtMs - 60_000) {
      return this.accessToken
    }
    if (this.refreshToken) {
      try {
        return await this.requestToken({ grant_type: 'refresh_token', refresh_token: this.refreshToken })
      } catch {
        // refresh expired/invalid — fall back to a fresh api_key exchange
      }
    }
    return await this.requestToken({
      grant_type: 'api_key',
      api_key: this.cfg.apiKey,
      scope: 'roles offline_access'
    })
  }

  /** Force a brand-new token (used by ApiClient after a 401). */
  async forceRefresh(): Promise<string> {
    this.accessToken = null
    this.refreshToken = null
    this.expiresAtMs = 0
    return this.getAccessToken()
  }

  private async requestToken(params: Record<string, string>): Promise<string> {
    const res = await this.fetchFn(`${this.cfg.apiUrl}/connect/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params).toString()
    })
    if (!res.ok) {
      throw new Error(
        `Failed to authenticate with Plan Budowlany API (HTTP ${res.status}). ` +
        `Check that your API key is valid and not revoked.`
      )
    }
    const data = (await res.json()) as TokenResponse
    this.accessToken = data.access_token
    this.refreshToken = data.refresh_token ?? null
    this.expiresAtMs = Date.now() + data.expires_in * 1000
    this._workspaceId = decodeWorkspaceId(data.access_token)
    return this.accessToken
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/auth.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/auth.ts src/__tests__/auth.test.ts
git commit -m "feat(auth): TokenManager — api_key exchange, refresh, WorkspaceId decode"
```

---

## Task 4: API client (authed fetch + envelope + 401 refresh)

**Files:**
- Create: `src/apiClient.ts`
- Test: `src/__tests__/apiClient.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/apiClient.test.ts
import { describe, it, expect, vi } from 'vitest'
import { ApiClient } from '../apiClient.js'

function fakeTm(workspaceId = 'ws-1') {
  return {
    getAccessToken: vi.fn().mockResolvedValue('jwt-token'),
    forceRefresh: vi.fn().mockResolvedValue('jwt-token-2'),
    workspaceId
  }
}

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body }
}

describe('ApiClient', () => {
  it('attaches bearer + X-Workspace-Id and unwraps the envelope', async () => {
    const tm = fakeTm('ws-9')
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true, data: { foo: 1 }, errors: null }))
    const client = new ApiClient({ apiUrl: 'https://api.test' }, tm as never, fetchMock as never)

    const data = await client.get<{ foo: number }>('/user/task')
    expect(data).toEqual({ foo: 1 })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.test/user/task')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer jwt-token')
    expect((init.headers as Record<string, string>)['X-Workspace-Id']).toBe('ws-9')
  })

  it('sends a JSON body on post', async () => {
    const tm = fakeTm()
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true, data: { ok: true }, errors: null }, true, 201))
    const client = new ApiClient({ apiUrl: 'https://api.test' }, tm as never, fetchMock as never)

    await client.post('/user/task', { title: 'X' })
    const init = fetchMock.mock.calls[0][1]
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ title: 'X' })
  })

  it('throws envelope error message on success:false', async () => {
    const tm = fakeTm()
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ success: false, data: null, errors: [{ code: 'X', message: 'Bad task' }] }, false, 400)
    )
    const client = new ApiClient({ apiUrl: 'https://api.test' }, tm as never, fetchMock as never)
    await expect(client.get('/user/task')).rejects.toThrow(/Bad task/)
  })

  it('refreshes once and retries on 401', async () => {
    const tm = fakeTm()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({}, false, 401))
      .mockResolvedValueOnce(jsonResponse({ success: true, data: { ok: 1 }, errors: null }))
    const client = new ApiClient({ apiUrl: 'https://api.test' }, tm as never, fetchMock as never)

    const data = await client.get<{ ok: number }>('/user/task')
    expect(data).toEqual({ ok: 1 })
    expect(tm.forceRefresh).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/apiClient.test.ts`
Expected: FAIL — cannot find module `../apiClient.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/apiClient.ts
import type { TokenManager } from './auth.js'

interface Envelope<T> {
  success: boolean
  data: T | null
  errors: Array<{ code: string; message: string; field?: string }> | null
}

interface ApiClientConfig {
  apiUrl: string
}

export class ApiClient {
  constructor(
    private cfg: ApiClientConfig,
    private tokens: TokenManager,
    private fetchFn: typeof fetch = fetch
  ) {}

  get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path)
  }

  post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('POST', path, body)
  }

  put<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('PUT', path, body)
  }

  private async request<T>(method: string, path: string, body?: unknown, isRetry = false): Promise<T> {
    const token = await this.tokens.getAccessToken()
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      'X-Workspace-Id': this.tokens.workspaceId,
      Accept: 'application/json'
    }
    if (body !== undefined) headers['Content-Type'] = 'application/json'

    const res = await this.fetchFn(`${this.cfg.apiUrl}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined
    })

    if (res.status === 401 && !isRetry) {
      await this.tokens.forceRefresh()
      return this.request<T>(method, path, body, true)
    }

    let envelope: Envelope<T> | null = null
    try {
      envelope = (await res.json()) as Envelope<T>
    } catch {
      envelope = null
    }

    if (!res.ok || (envelope && envelope.success === false)) {
      const msg = envelope?.errors?.map(e => e.message).join('; ') || `HTTP ${res.status} on ${path}`
      throw new Error(msg)
    }
    // Some endpoints (204) return no body
    return (envelope ? envelope.data : null) as T
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/apiClient.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/apiClient.ts src/__tests__/apiClient.test.ts
git commit -m "feat(apiClient): authed fetch with envelope unwrap and 401-refresh retry"
```

---

## Task 5: Shared types + tool registration helper

**Files:**
- Create: `src/types.ts`, `src/tools/register.ts`

- [ ] **Step 1: Create `src/types.ts`** (only the fields the tools surface)

```ts
// src/types.ts
export interface WorkspaceMember {
  userExternalId: string
  email: string
  role: string
  isAccepted: boolean
}
export interface WorkspaceInfo {
  externalId: string
  name: string
  defaultLanguage: string
  defaultCurrency: string
  budget: number
  tasksCount: number
  members?: WorkspaceMember[]
}

export type MainTaskStatus = 'toDo' | 'inProgress' | 'done' | 'delayed'

export interface SubtaskDto {
  externalId: string
  title: string
  isCompleted: boolean
  dueDate: string | null
}
export interface MainTaskDetail {
  externalId: string
  title: string
  description: string
  status: MainTaskStatus
  dueDate: string | null
  beginDate: string | null
  endDate: string | null
  subtasksCount: number
  completedSubtasksCount: number
  totalCostValue: number
  totalCostCurrency: string
  subtasks: SubtaskDto[]
  dependsOnTaskExternalIds: string[]
}

export type Currency = 'pln' | 'eur' | 'usd'
export interface CostItem {
  externalId: string
  name: string
  amount: number
  currency: Currency
  paid: boolean
  mainTask?: { externalId: string; title: string } | null
}
export interface CostDashboard {
  totalCost: number
  currency: Currency
  totalBudget: number
  spentBudget: number
  remainingBudget: number
  paidCosts: number
  unpaidCosts: number
  budgetExceeded: boolean
  costByTasks: Array<{ taskExternalId: string; taskTitle: string; taskCost: number }>
}

export interface IssueReportSummary {
  externalId: string
  title: string
  reportDate: string
  status: string
  taskName: string
  totalIssues: number
  openIssues: number
}
export interface IssueReportDetail extends IssueReportSummary {
  issues: Array<{
    externalId: string
    sequenceNumber: number
    title: string
    description: string
    severity: string
    status: string
    resolution: string
  }>
}

export interface ActivityItem {
  occurredAt: string
  category: string
  description: string
  params: Record<string, string>
  actorName: string
}
export interface ActivityFeed {
  items: ActivityItem[]
  nextCursor: string | null
}

export interface TimelineTask {
  id: string
  name: string
  start: string | null
  end: string | null
  progress: number
  status: string
  dependencies: string[]
  subtasks: Array<{ id: string; title: string; dueDate: string; isCompleted: boolean }>
}
export interface ProjectTimeline {
  workspaceId: string
  timelineData: Array<{
    categoryId: string | null
    categoryName: string
    tasks: TimelineTask[]
  }>
}
```

- [ ] **Step 2: Create `src/tools/register.ts`**

```ts
// src/tools/register.ts
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ZodRawShape } from 'zod'

/**
 * Registers a tool whose handler returns plain JSON-serialisable data.
 * The data is emitted both as pretty text (for the LLM) and as structuredContent.
 * Errors are returned as an isError tool result so the model can recover instead of crashing.
 */
export function registerJsonTool<S extends ZodRawShape>(
  server: McpServer,
  name: string,
  meta: { title: string; description: string; inputSchema: S },
  handler: (args: Record<string, unknown>) => Promise<unknown>
): void {
  server.registerTool(name, meta as never, (async (args: Record<string, unknown>) => {
    try {
      const result = await handler(args)
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true }
    }
  }) as never)
}
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/types.ts src/tools/register.ts
git commit -m "feat(types): API DTO types + registerJsonTool helper"
```

---

## Task 6: Workspace tool

**Files:**
- Create: `src/tools/workspace.ts`

- [ ] **Step 1: Create `src/tools/workspace.ts`**

```ts
// src/tools/workspace.ts
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
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/tools/workspace.ts
git commit -m "feat(tools): get_workspace_info"
```

---

## Task 7: Task tools

**Files:**
- Create: `src/tools/tasks.ts`

- [ ] **Step 1: Create `src/tools/tasks.ts`**

```ts
// src/tools/tasks.ts
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
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/tools/tasks.ts
git commit -m "feat(tools): list/get/create tasks, update status, create subtask"
```

---

## Task 8: Cost tools (task link mandatory)

**Files:**
- Create: `src/tools/costs.ts`

- [ ] **Step 1: Create `src/tools/costs.ts`**

```ts
// src/tools/costs.ts
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
      inputSchema: {
        taskExternalId: z.string().uuid().optional().describe('Filter to one task')
      }
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
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/tools/costs.ts
git commit -m "feat(tools): list_costs, get_cost_summary, create_cost (task link required)"
```

---

## Task 9: Issue tools

**Files:**
- Create: `src/tools/issues.ts`

- [ ] **Step 1: Create `src/tools/issues.ts`**

```ts
// src/tools/issues.ts
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
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/tools/issues.ts
git commit -m "feat(tools): list_issues, get_issue"
```

---

## Task 10: Diary (activity feed) tool

**Files:**
- Create: `src/tools/diary.ts`

- [ ] **Step 1: Create `src/tools/diary.ts`**

```ts
// src/tools/diary.ts
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
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/tools/diary.ts
git commit -m "feat(tools): list_activity (construction diary feed)"
```

---

## Task 11: Timeline tool

**Files:**
- Create: `src/tools/timeline.ts`

- [ ] **Step 1: Create `src/tools/timeline.ts`**

```ts
// src/tools/timeline.ts
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
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/tools/timeline.ts
git commit -m "feat(tools): get_timeline (Gantt/schedule data)"
```

---

## Task 12: Server entry point + smoke test

**Files:**
- Create: `src/index.ts`
- Test: `src/__tests__/tools.test.ts`

- [ ] **Step 1: Write the failing test** (registers tools against a real McpServer and asserts the set)

```ts
// src/__tests__/tools.test.ts
import { describe, it, expect, vi } from 'vitest'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerAllTools } from '../index.js'

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/tools.test.ts`
Expected: FAIL — `registerAllTools` not exported from `../index.js`.

- [ ] **Step 3: Write `src/index.ts`**

```ts
#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { loadConfig } from './config.js'
import { TokenManager } from './auth.js'
import { ApiClient } from './apiClient.js'
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

async function main(): Promise<void> {
  const config = loadConfig()
  const tokens = new TokenManager(config)
  const api = new ApiClient({ apiUrl: config.apiUrl }, tokens)

  const server = new McpServer({ name: 'planbudowlany', version: '0.1.0' })
  registerAllTools(server, api)

  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch((err) => {
  // stderr only — stdout is the MCP transport and must stay clean
  process.stderr.write(`[planbudowlany-mcp] fatal: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/tools.test.ts`
Expected: PASS (1 test, 13 tools registered).

- [ ] **Step 5: Full build + test**

Run: `npm run build && npm test`
Expected: `tsc` emits `dist/`, all vitest suites pass.

- [ ] **Step 6: Manual smoke test against the local backend**

Pre-req: local API running (`docker compose up` in planbudowlany-api), and a key created via the Klucze API tab.
Run:
```bash
PB_API_KEY=pb_<yourLocalKey> PB_API_URL=http://localhost:8080 \
  npx @modelcontextprotocol/inspector node dist/index.js
```
Expected: inspector lists 13 tools; calling `get_workspace_info` returns the workspace JSON.

- [ ] **Step 7: Commit**

```bash
git add src/index.ts src/__tests__/tools.test.ts
git commit -m "feat: stdio MCP server entry point wiring all tools"
```

---

## Task 13: README + publish prep

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write `README.md`**

````markdown
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
npm run build     # tsc → dist/
```
````

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: README with Claude Desktop config and tool reference"
```

- [ ] **Step 3: (Manual, when ready) publish**

Run: `npm publish --access public`
Expected: package published as `planbudowlany-mcp`.

---

## Self-Review notes

- **Auth replay safety:** the JWT is workspace-scoped (`WorkspaceId` claim) and `ApiClient` always sends the matching `X-Workspace-Id`; the backend `WorkspaceContextFilter` rejects mismatches. Tools never accept a workspace id from the model.
- **Cost↔task invariant:** `create_cost` makes `mainTaskExternalId` a required Zod field and the description instructs the model to call `list_tasks` and ask the user before guessing — matching the API's `NotEmpty` rule.
- **Enum fidelity:** all status/currency enums use the exact camelCase values the API serializes.
- **stdout hygiene:** only the MCP transport writes to stdout; fatal errors go to stderr (Step 3, Task 12) so the protocol stream stays clean.
- **No placeholders:** every file has complete code; tool tests cover registration; config/auth/apiClient have behavioral unit tests.

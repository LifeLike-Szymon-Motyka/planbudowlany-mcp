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

  get<T>(path: string): Promise<T> { return this.request<T>('GET', path) }
  post<T>(path: string, body: unknown): Promise<T> { return this.request<T>('POST', path, body) }
  put<T>(path: string, body: unknown): Promise<T> { return this.request<T>('PUT', path, body) }

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
    return (envelope ? envelope.data : null) as T
  }
}

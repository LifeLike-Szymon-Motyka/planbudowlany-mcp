import type { Config } from './config.js'

interface TokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
  token_type: string
}

const SCOPE = 'roles offline_access'
// Fallback lifetime when the server omits/zeroes expires_in, so caching still works
// instead of re-exchanging the key on every call.
const DEFAULT_LIFETIME_SEC = 300

export function decodeWorkspaceId(jwt: string): string {
  const parts = jwt.split('.')
  if (parts.length < 2) {
    throw new Error('Access token is not a JWT — cannot read the WorkspaceId claim. Is this an api_key token?')
  }
  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
  } catch {
    throw new Error('Access token payload is not valid JSON — cannot read the WorkspaceId claim. Is this an api_key token?')
  }
  const ws = payload.WorkspaceId ?? payload.workspaceId ?? payload.workspace_id
  if (!ws) throw new Error('Token has no WorkspaceId claim — is this an api_key token?')
  return String(ws)
}

export class TokenManager {
  private accessToken: string | null = null
  private refreshToken: string | null = null
  private expiresAtMs = 0
  private _workspaceId: string | null = null
  // Single-flight: concurrent tool calls that hit an expired token share one /connect/token request.
  private inflight: Promise<string> | null = null

  constructor(private cfg: Config, private fetchFn: typeof fetch = fetch) {}

  get workspaceId(): string {
    if (!this._workspaceId) throw new Error('Not authenticated yet — call getAccessToken() first.')
    return this._workspaceId
  }

  async getAccessToken(): Promise<string> {
    // 60s safety margin so we never hand out a token that expires mid-request
    if (this.accessToken && Date.now() < this.expiresAtMs - 60_000) {
      return this.accessToken
    }
    if (this.inflight) return this.inflight
    this.inflight = this.acquireToken().finally(() => {
      this.inflight = null
    })
    return this.inflight
  }

  /** Force a brand-new token (used by ApiClient after a 401). */
  async forceRefresh(): Promise<string> {
    this.accessToken = null
    this.refreshToken = null
    this.expiresAtMs = 0
    this.inflight = null
    return this.getAccessToken()
  }

  private async acquireToken(): Promise<string> {
    if (this.refreshToken) {
      try {
        return await this.requestToken({
          grant_type: 'refresh_token',
          refresh_token: this.refreshToken,
          scope: SCOPE
        })
      } catch {
        // refresh expired/invalid — fall back to a fresh api_key exchange
      }
    }
    return await this.requestToken({
      grant_type: 'api_key',
      api_key: this.cfg.apiKey,
      scope: SCOPE
    })
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
    if (!data.access_token) {
      throw new Error('Token endpoint returned no access_token.')
    }
    this.accessToken = data.access_token
    // Keep an existing refresh token if the refresh response doesn't return a new one.
    this.refreshToken = data.refresh_token ?? this.refreshToken
    const lifetimeSec = typeof data.expires_in === 'number' && data.expires_in > 0
      ? data.expires_in
      : DEFAULT_LIFETIME_SEC
    this.expiresAtMs = Date.now() + lifetimeSec * 1000
    this._workspaceId = decodeWorkspaceId(data.access_token)
    return this.accessToken
  }
}

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

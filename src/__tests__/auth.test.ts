import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TokenManager, decodeWorkspaceId } from '../auth.js'

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
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: 'invalid_grant' }) })
    const tm = new TokenManager({ apiKey: 'pb_bad', apiUrl }, fetchMock as unknown as typeof fetch)
    await expect(tm.getAccessToken()).rejects.toThrow(/API key/i)
  })
})

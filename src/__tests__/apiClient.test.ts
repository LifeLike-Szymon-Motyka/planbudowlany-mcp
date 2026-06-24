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

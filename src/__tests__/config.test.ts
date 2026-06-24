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

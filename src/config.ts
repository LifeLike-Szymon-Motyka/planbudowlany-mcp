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

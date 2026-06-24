import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ZodRawShape } from 'zod'

/**
 * Registers a tool whose handler returns plain JSON-serialisable data.
 * The data is emitted as pretty text for the LLM. Errors become an isError result.
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
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true }
    }
  }) as never)
}

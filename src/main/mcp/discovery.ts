import { realpath, stat } from 'node:fs/promises'
import { extname, isAbsolute } from 'node:path'
import type { McpDiscovery, McpProbe } from '../../shared/mcp'

export async function resolveMcpExecutable(path: string): Promise<string> {
  if (!isAbsolute(path) || /^[\\/]{2}/.test(path)) throw new Error('Select a local executable.')
  const command = await realpath(path)
  if (/^[\\/]{2}/.test(command) || (process.platform === 'win32' && extname(command).toLowerCase() !== '.exe') ||
    !(await stat(command)).isFile()) {
    throw new Error('Select a local executable.')
  }
  return command
}

export async function discoverMcpTools(config: McpProbe): Promise<McpDiscovery> {
  const command = await resolveMcpExecutable(config.executable)
  const { Client } = await import('@modelcontextprotocol/client')
  const { StdioClientTransport } = await import('@modelcontextprotocol/client/stdio')
  const transport = new StdioClientTransport({ command, args: config.args, stderr: 'ignore', maxBufferSize: 1024 * 1024 })
  const client = new Client({ name: 'DeskAgent', version: '0.1.0' }, { versionNegotiation: { mode: 'legacy' } })
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('MCP discovery timed out.')), 10_000)
    })
    const operation = async (): Promise<McpDiscovery> => {
      await client.connect(transport)
      if (!client.getServerCapabilities()?.tools) return { tools: [], truncated: false }
      const result = await client.listTools()
      return {
        tools: result.tools.slice(0, 100).map(({ name, description }) => ({
          name: name.slice(0, 128), description: (description ?? '').slice(0, 2_000),
        })),
        truncated: result.tools.length > 100 || Boolean(result.nextCursor),
      }
    }
    return await Promise.race([operation(), deadline])
  } finally {
    clearTimeout(timer)
    await client.close()
  }
}

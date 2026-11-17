import { realpath, stat } from 'node:fs/promises'
import { extname, isAbsolute } from 'node:path'
import { Ajv2020 } from 'ajv/dist/2020.js'
import type { Client as McpClient } from '@modelcontextprotocol/client'
import type { McpCallResult, McpDiscovery, McpProbe } from '../../shared/mcp'

export async function resolveMcpExecutable(path: string): Promise<string> {
  if (!isAbsolute(path) || /^[\\/]{2}/.test(path)) throw new Error('Select a local executable.')
  const command = await realpath(path)
  if (/^[\\/]{2}/.test(command) || (process.platform === 'win32' && extname(command).toLowerCase() !== '.exe') ||
    !(await stat(command)).isFile()) {
    throw new Error('Select a local executable.')
  }
  return command
}

async function withMcpClient<T>(config: McpProbe, operate: (client: McpClient) => Promise<T>): Promise<T> {
  const command = await resolveMcpExecutable(config.executable)
  const { Client } = await import('@modelcontextprotocol/client')
  const { StdioClientTransport } = await import('@modelcontextprotocol/client/stdio')
  const transport = new StdioClientTransport({ command, args: config.args, stderr: 'ignore', maxBufferSize: 1024 * 1024 })
  const client = new Client({ name: 'DeskAgent', version: '0.1.0' }, { versionNegotiation: { mode: 'legacy' } })
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('The MCP request timed out.')), 10_000)
    })
    const operation = async () => {
      await client.connect(transport)
      return operate(client)
    }
    return await Promise.race([operation(), deadline])
  } finally {
    clearTimeout(timer)
    await client.close()
  }
}

export async function discoverMcpTools(config: McpProbe): Promise<McpDiscovery> {
  return withMcpClient(config, async (client) => {
      if (!client.getServerCapabilities()?.tools) return { tools: [], truncated: false }
      const result = await client.listTools()
      return {
        tools: result.tools.slice(0, 100).map(({ name, description }) => ({
          name, description: (description ?? '').slice(0, 2_000),
        })),
        truncated: result.tools.length > 100 || Boolean(result.nextCursor),
      }
  })
}

export async function callMcpTool(config: McpProbe, tool: string, args: Record<string, unknown>): Promise<McpCallResult> {
  return withMcpClient(config, async (client) => {
    if (!client.getServerCapabilities()?.tools) throw new Error('This MCP server has no tools.')
    const listed = await client.listTools()
    const advertised = listed.tools.slice(0, 100).find(({ name }) => name === tool)
    if (!advertised) throw new Error('The selected tool is no longer available.')
    const validator = new Ajv2020({ strict: false, validateFormats: false })
    if (!validator.compile(advertised.inputSchema)(args)) throw new Error('Arguments do not match the tool schema.')
    const result = await client.callTool({ name: tool, arguments: args })
    const output = (result.content ?? []).flatMap((item) => item.type === 'text' ? [item.text] : []).join('\n')
    const text = output || (result.structuredContent ? JSON.stringify(result.structuredContent, null, 2) : 'No text output.')
    return { text: text.slice(0, 16_000), failed: Boolean(result.isError), truncated: text.length > 16_000 }
  })
}

import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { callMcpTool, discoverMcpTools, resolveMcpExecutable } from '../src/main/mcp/discovery'

it('rejects a relative executable path', async () => {
  await expect(resolveMcpExecutable('server.exe')).rejects.toThrow('Select a local executable.')
})

it('discovers tool metadata from a local stdio MCP child', async () => {
  const fixture = fileURLToPath(new URL('./fixtures/mcp-discovery.mjs', import.meta.url))
  const result = await discoverMcpTools({ executable: process.execPath, args: [fixture] })
  expect(result).toMatchObject({ tools: [{ name: 'fixture_tool', description: 'A local fixture' }], truncated: false })
  expect(JSON.parse(result.tools[0]?.inputSchema ?? '')).toMatchObject({
    type: 'object', properties: { text: { type: 'string' } }, required: ['text'],
  })
}, 15_000)

it('calls a published tool and rejects requests that fail the advertised schema', async () => {
  const fixture = fileURLToPath(new URL('./fixtures/mcp-discovery.mjs', import.meta.url))
  const config = { executable: process.execPath, args: [fixture] }
  await expect(callMcpTool(config, 'fixture_tool', { text: 'Approved input' })).resolves.toEqual({
    text: 'Approved input', failed: false, truncated: false,
  })
  await expect(callMcpTool(config, 'fixture_tool', { text: 7 })).rejects.toThrow('Arguments do not match')
  await expect(callMcpTool(config, 'missing', {})).rejects.toThrow('no longer available')
}, 15_000)

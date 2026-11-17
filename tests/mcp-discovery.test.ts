import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { discoverMcpTools, resolveMcpExecutable } from '../src/main/mcp/discovery'

it('rejects a relative executable path', async () => {
  await expect(resolveMcpExecutable('server.exe')).rejects.toThrow('Select a local executable.')
})

it('discovers tool metadata from a local stdio MCP child', async () => {
  const fixture = fileURLToPath(new URL('./fixtures/mcp-discovery.mjs', import.meta.url))
  await expect(discoverMcpTools({ executable: process.execPath, args: [fixture] })).resolves.toEqual({
    tools: [{ name: 'fixture_tool', description: 'A local fixture' }], truncated: false,
  })
}, 15_000)

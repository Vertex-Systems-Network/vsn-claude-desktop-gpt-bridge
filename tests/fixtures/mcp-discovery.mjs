import { createInterface } from 'node:readline'

const input = createInterface({ input: process.stdin })
for await (const line of input) {
  const request = JSON.parse(line)
  if (request.id === undefined) continue
  let result
  if (request.method === 'initialize') {
    result = {
      protocolVersion: request.params.protocolVersion,
      capabilities: { tools: {} },
      serverInfo: { name: 'discovery-fixture', version: '1.0.0' },
    }
  }
  if (request.method === 'tools/list') {
    result = { tools: [{ name: 'fixture_tool', description: 'A local fixture', inputSchema: { type: 'object' } }] }
  }
  const reply = result ? { result } : { error: { code: -32601, message: 'Method not found' } }
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, ...reply }) + '\n')
}

import { expect, it } from 'vitest'
import { appendMcpOutput } from '../src/shared/mcp-context'
import { maxPromptLength } from '../src/shared/chat'

it('preserves the user draft and keeps the tool data inside a quoted JSON block', () => {
  const draft = 'Summarize this.'
  const output = 'Line one\n"Quoted"'
  const result = appendMcpOutput(draft, 'notes', output, true)
  const prefix = draft + '\n\nMCP tool output (reference material)\n'
  expect(result?.startsWith(prefix)).toBe(true)
  expect(JSON.parse(result?.slice(prefix.length) ?? '')).toEqual({ tool: 'notes', output, truncated: true })
})

it('does not discard existing draft text to make room for output', () => {
  expect(appendMcpOutput('x'.repeat(maxPromptLength), 'notes', 'result', false)).toBeUndefined()
  expect(appendMcpOutput('', 'notes', ' ', false)).toBeUndefined()
})

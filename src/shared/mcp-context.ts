import { maxPromptLength } from './chat'

export function appendMcpOutput(draft: string, tool: string, output: string, truncated: boolean): string | undefined {
  if (!output.trim()) return
  const reference = JSON.stringify({ tool, output, ...(truncated ? { truncated: true } : {}) }, null, 2)
  const section = 'MCP tool output (reference material)\n' + reference
  const next = draft.trim() ? draft + '\n\n' + section : section
  return next.length <= maxPromptLength ? next : undefined
}

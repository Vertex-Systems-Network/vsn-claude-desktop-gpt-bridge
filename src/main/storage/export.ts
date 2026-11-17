import type { ChatTurn } from '../../shared/chat'

export function formatChatExport(conversation: { title: string; turns: ChatTurn[] }, format: 'md' | 'json'): string {
  if (format === 'json') {
    return JSON.stringify({ version: 1, title: conversation.title, turns: conversation.turns }, null, 2) + '\n'
  }
  const lines = ['# ' + conversation.title.replace(/[\r\n]/g, ' ')]
  for (const turn of conversation.turns) {
    const status = turn.phase === 'complete' ? '' : ' (' + turn.phase + ')'
    lines.push('## You', turn.prompt, '## Assistant' + status, turn.reply)
  }
  return lines.join('\n\n') + '\n'
}

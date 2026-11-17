import { expect, it } from 'vitest'
import type { ChatTurn } from '../src/shared/chat'
import { formatChatExport } from '../src/main/storage/export'

it('marks interrupted replies in Markdown and preserves the status in JSON', () => {
  const turns: ChatTurn[] = [{ prompt: 'hello', reply: 'partial', phase: 'stopped' }]
  const chat = { title: 'Example', turns }
  expect(formatChatExport(chat, 'md')).toContain('## Assistant (stopped)\n\npartial')
  expect(JSON.parse(formatChatExport(chat, 'json'))).toEqual({ version: 1, ...chat })
})

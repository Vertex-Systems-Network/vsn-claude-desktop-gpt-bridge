import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { ChatHistory } from '../src/main/storage/history'

it('restores complete and interrupted replies from a real database after reopening', () => {
  const directory = mkdtempSync(join(tmpdir(), 'deskagent-history-'))
  try {
    const path = join(directory, 'chat.sqlite3')
    const first = new ChatHistory(path)
    let id: string
    try {
      id = first.append('profile', undefined, 0, 'model', 'hello')
      first.update('profile', id, 0, { prompt: 'hello', reply: 'world', phase: 'complete' })
      first.append('profile', id, 1, 'model', 'second')
      first.update('profile', id, 1, { prompt: 'second', reply: 'partial', phase: 'streaming' })
      expect(() => first.append('other', id, 2, 'model', 'blocked')).toThrow()
    } finally { first.close() }

    const next = new ChatHistory(path)
    try {
      expect(next.list('profile')).toEqual([{ id, title: 'hello' }])
      expect(next.list('other')).toEqual([])
      expect(next.search('profile', 'WORLD').map(({ id }) => id)).toEqual([id])
      expect(next.search('profile', '%')).toEqual([])
      expect(next.search('other', 'world')).toEqual([])
      expect(next.read('other', id)).toBeUndefined()
      expect(next.read('profile', id)).toEqual([
        { prompt: 'hello', reply: 'world', phase: 'complete' },
        { prompt: 'second', reply: 'partial', phase: 'stopped' },
      ])
    } finally { next.close() }
  } finally { rmSync(directory, { recursive: true, force: true }) }
})

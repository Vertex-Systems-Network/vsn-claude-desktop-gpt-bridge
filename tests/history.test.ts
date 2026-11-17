import { DatabaseSync } from 'node:sqlite'
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

it('renames, archives, restores and deletes chats only within the owning account', () => {
  const history = new ChatHistory(':memory:')
  try {
    const id = history.append('owner', undefined, 0, 'model', 'old title')
    expect(history.rename('other', id, 'forbidden')).toBe(false)
    expect(history.archive('other', id, true)).toBe(false)
    expect(history.delete('other', id)).toBe(false)
    expect(history.rename('owner', id, 'new title')).toBe(true)
    expect(history.archive('owner', id, true)).toBe(true)
    expect(history.list('owner')).toEqual([])
    expect(history.search('owner', 'new')).toEqual([])
    expect(history.search('owner', 'new', true)).toEqual([{ id, title: 'new title' }])
    expect(() => history.append('owner', id, 1, 'model', 'blocked')).toThrow()
    expect(history.archive('owner', id, false)).toBe(true)
    expect(history.details('owner', id)).toEqual({ title: 'new title', archived: false })
    expect(history.delete('owner', id)).toBe(true)
    expect(history.read('owner', id)).toBeUndefined()
  } finally { history.close() }
})

it('upgrades a version 1 history without losing the existing conversation', () => {
  const directory = mkdtempSync(join(tmpdir(), 'deskagent-migration-'))
  try {
    const path = join(directory, 'chat.sqlite3')
    const original = new ChatHistory(path)
    let id: string
    try { id = original.append('owner', undefined, 0, 'model', 'old history') }
    finally { original.close() }
    const legacy = new DatabaseSync(path)
    try { legacy.exec('ALTER TABLE conversations DROP COLUMN archived; PRAGMA user_version = 1') }
    finally { legacy.close() }
    const upgraded = new ChatHistory(path)
    try {
      expect(upgraded.list('owner')).toEqual([{ id, title: 'old history' }])
      expect(upgraded.read('owner', id)?.[0]?.prompt).toBe('old history')
      expect(upgraded.archive('owner', id, true)).toBe(true)
    } finally { upgraded.close() }
  } finally { rmSync(directory, { recursive: true, force: true }) }
})

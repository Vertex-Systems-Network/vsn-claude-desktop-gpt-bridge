import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { Projects } from '../src/main/storage/projects'

it('restores project metadata after reopening and updates or removes it by ID', () => {
  const folder = mkdtempSync(join(tmpdir(), 'deskagent-projects-'))
  try {
    const path = join(folder, 'projects.sqlite3')
    const initial = new Projects(path)
    let id: string
    try {
      const project = initial.save({ name: 'Sample', folder, instructions: 'First instruction' })
      id = project.id
      expect(() => initial.save({ name: 'sample', folder, instructions: '' })).toThrow('already uses')
    } finally { initial.close() }
    const reopened = new Projects(path)
    try {
      expect(reopened.list()).toEqual([{ id, name: 'Sample', folder, instructions: 'First instruction' }])
      reopened.save({ name: 'Renamed', folder, instructions: 'Updated' }, id)
      expect(reopened.get(id)?.instructions).toBe('Updated')
      expect(reopened.delete(id)).toBe(true)
      expect(reopened.list()).toEqual([])
    } finally { reopened.close() }
  } finally { rmSync(folder, { recursive: true, force: true }) }
})

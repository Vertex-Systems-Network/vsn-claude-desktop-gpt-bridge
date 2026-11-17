import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import type { Project } from '../../shared/project'

export class Projects {
  private readonly database: DatabaseSync

  constructor(path: string) {
    this.database = new DatabaseSync(path)
    try {
      const version = this.database.prepare('PRAGMA user_version').get()?.user_version
      if (version === 0) this.database.exec(`
        BEGIN;
        CREATE TABLE projects (
          id TEXT PRIMARY KEY, name TEXT NOT NULL COLLATE NOCASE UNIQUE,
          folder TEXT NOT NULL, instructions TEXT NOT NULL
        ) STRICT;
        PRAGMA user_version = 1;
        COMMIT;
      `)
      else if (version !== 1) throw new Error('Unsupported Projects database version')
    } catch (error) {
      this.database.close()
      throw error
    }
  }

  list(): Project[] {
    return this.database.prepare('SELECT id, name, folder, instructions FROM projects ORDER BY name, id').all() as Project[]
  }

  get(id: string): Project | undefined {
    return this.database.prepare('SELECT id, name, folder, instructions FROM projects WHERE id = ?').get(id) as Project | undefined
  }

  save(input: Omit<Project, 'id'>, id?: string): Project {
    const existing = this.database.prepare('SELECT id FROM projects WHERE name = ?').get(input.name)
    if (existing && existing.id !== id) throw new Error('A project already uses this name.')
    if (id) {
      const result = this.database.prepare('UPDATE projects SET name = ?, folder = ?, instructions = ? WHERE id = ?')
        .run(input.name, input.folder, input.instructions, id)
      if (!result.changes) throw new Error('Project no longer exists.')
      return { ...input, id }
    }
    const created = { ...input, id: randomUUID() }
    this.database.prepare('INSERT INTO projects (id, name, folder, instructions) VALUES (?, ?, ?, ?)')
      .run(created.id, created.name, created.folder, created.instructions)
    return created
  }

  delete(id: string): boolean {
    return !!this.database.prepare('DELETE FROM projects WHERE id = ?').run(id).changes
  }

  close(): void { this.database.close() }
}

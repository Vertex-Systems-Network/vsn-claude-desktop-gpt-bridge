import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { z } from 'zod'
import { decryptCredential, encryptCredential } from '../auth/credential-protection'
import type { McpProfile, McpProfileInput } from '../../shared/mcp'

const details = z.strictObject({ executable: z.string(), args: z.array(z.string()) })

export class McpProfiles {
  private readonly database: DatabaseSync

  constructor(path: string) {
    this.database = new DatabaseSync(path)
    try {
      const version = this.database.prepare('PRAGMA user_version').get()?.user_version
      if (version === 0) this.database.exec(`
        BEGIN;
        CREATE TABLE profiles (
          id TEXT PRIMARY KEY, name TEXT NOT NULL COLLATE NOCASE UNIQUE, details BLOB NOT NULL
        ) STRICT;
        PRAGMA user_version = 1;
        COMMIT;
      `)
      else if (version !== 1) throw new Error('Unsupported MCP profiles database version')
    } catch (error) {
      this.database.close()
      throw error
    }
  }

  list(): McpProfile[] {
    return this.database.prepare('SELECT id, name, details FROM profiles ORDER BY name, id').all().map((row) => {
      if (typeof row.id !== 'string' || typeof row.name !== 'string' || !(row.details instanceof Uint8Array)) {
        throw new Error('Invalid MCP profile record')
      }
      const config = details.parse(JSON.parse(decryptCredential(Buffer.from(row.details))))
      return { id: row.id, name: row.name, ...config }
    })
  }

  save(input: McpProfileInput): McpProfile {
    const duplicate = this.database.prepare('SELECT id FROM profiles WHERE name = ?').get(input.name)
    if (duplicate && duplicate.id !== input.id) throw new Error('A server profile already uses this name.')
    const config = { executable: input.executable, args: input.args }
    const encrypted = encryptCredential(JSON.stringify(config))
    const id = input.id ?? randomUUID()
    if (input.id) {
      if (!this.database.prepare('UPDATE profiles SET name = ?, details = ? WHERE id = ?')
        .run(input.name, encrypted, id).changes) throw new Error('MCP profile not found.')
    } else {
      this.database.prepare('INSERT INTO profiles (id, name, details) VALUES (?, ?, ?)').run(id, input.name, encrypted)
    }
    return { id, name: input.name, ...config }
  }

  remove(id: string): boolean {
    return !!this.database.prepare('DELETE FROM profiles WHERE id = ?').run(id).changes
  }

  close(): void { this.database.close() }
}

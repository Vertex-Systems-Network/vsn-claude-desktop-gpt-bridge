import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import type { ChatTurn, SavedChat } from '../../shared/chat'

export class ChatHistory {
  private readonly db: DatabaseSync

  constructor(path: string) {
    this.db = new DatabaseSync(path)
    try {
      this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000')
      const version = Number(this.db.prepare('PRAGMA user_version').get()?.user_version)
      if (version > 2) throw new Error('Chat database was created by a newer DeskAgent version')
      if (version === 0) this.db.exec(`
        BEGIN;
        CREATE TABLE conversations (
          id TEXT PRIMARY KEY, account TEXT NOT NULL, title TEXT NOT NULL, updated INTEGER NOT NULL
        ) STRICT;
        CREATE INDEX recent_conversations ON conversations(account, updated DESC);
        CREATE TABLE messages (
          id INTEGER PRIMARY KEY, conversation TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
          position INTEGER NOT NULL, model TEXT NOT NULL, prompt TEXT NOT NULL, reply TEXT NOT NULL,
          phase TEXT NOT NULL CHECK(phase IN ('streaming', 'complete', 'stopped', 'failed')),
          UNIQUE(conversation, position)
        ) STRICT;
        PRAGMA user_version = 1;
        COMMIT;
      `)
      if (version < 2) this.db.exec(`
        BEGIN;
        ALTER TABLE conversations ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0, 1));
        PRAGMA user_version = 2;
        COMMIT;
      `)
      this.db.exec("UPDATE messages SET phase = 'stopped' WHERE phase = 'streaming'")
    } catch (error) {
      this.db.close()
      throw error
    }
  }

  list(account: string, archived = false): SavedChat[] {
    return this.db.prepare('SELECT id, title FROM conversations WHERE account = ? AND archived = ? ORDER BY updated DESC, rowid DESC LIMIT 100')
      .all(account, Number(archived)) as SavedChat[]
  }

  search(account: string, query: string, archived = false): SavedChat[] {
    return this.db.prepare(`
      SELECT c.id, c.title FROM conversations c WHERE c.account = ? AND c.archived = ? AND (
        instr(lower(c.title), lower(?)) > 0 OR EXISTS (
          SELECT 1 FROM messages m WHERE m.conversation = c.id AND
          (instr(lower(m.prompt), lower(?)) > 0 OR instr(lower(m.reply), lower(?)) > 0)
        )
      ) ORDER BY c.updated DESC, c.rowid DESC LIMIT 100
    `).all(account, Number(archived), query, query, query) as SavedChat[]
  }

  details(account: string, id: string): { title: string; archived: boolean } | undefined {
    const row = this.db.prepare('SELECT title, archived FROM conversations WHERE account = ? AND id = ?').get(account, id)
    if (row) return { title: String(row.title), archived: row.archived === 1 }
  }

  rename(account: string, id: string, title: string): boolean {
    return !!this.db.prepare('UPDATE conversations SET title = ? WHERE account = ? AND id = ?').run(title, account, id).changes
  }

  archive(account: string, id: string, archived: boolean): boolean {
    return !!this.db.prepare('UPDATE conversations SET archived = ? WHERE account = ? AND id = ?')
      .run(Number(archived), account, id).changes
  }

  delete(account: string, id: string): boolean {
    return !!this.db.prepare('DELETE FROM conversations WHERE account = ? AND id = ?').run(account, id).changes
  }

  read(account: string, id: string): ChatTurn[] | undefined {
    if (!this.db.prepare('SELECT 1 FROM conversations WHERE account = ? AND id = ?').get(account, id)) return
    return this.db.prepare('SELECT prompt, reply, phase FROM messages WHERE conversation = ? ORDER BY position').all(id) as ChatTurn[]
  }

  append(account: string, current: string | undefined, position: number, model: string, prompt: string): string {
    const id = current ?? randomUUID()
    this.db.exec('BEGIN IMMEDIATE')
    try {
      if (current) {
        const changed = this.db.prepare('UPDATE conversations SET updated = ? WHERE account = ? AND id = ? AND archived = 0').run(Date.now(), account, id)
        if (!changed.changes) throw new Error('Conversation not found')
      } else {
        const title = Array.from(prompt.replace(/\s+/g, ' ')).slice(0, 70).join('')
        this.db.prepare('INSERT INTO conversations (id, account, title, updated) VALUES (?, ?, ?, ?)').run(id, account, title, Date.now())
      }
      this.db.prepare("INSERT INTO messages (conversation, position, model, prompt, reply, phase) VALUES (?, ?, ?, ?, '', 'streaming')")
        .run(id, position, model, prompt)
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
    return id
  }

  update(account: string, id: string, position: number, turn: ChatTurn): void {
    const changed = this.db.prepare(`
      UPDATE messages SET reply = ?, phase = ? WHERE conversation = ? AND position = ?
      AND EXISTS (SELECT 1 FROM conversations WHERE id = ? AND account = ?)
    `).run(turn.reply, turn.phase, id, position, id, account)
    if (!changed.changes) throw new Error('Message not found')
  }

  close(): void { this.db.close() }
}

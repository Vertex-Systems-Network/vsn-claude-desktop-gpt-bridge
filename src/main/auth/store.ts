import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { decryptCredential, encryptCredential } from './credential-protection'

const schema = z.strictObject({
  hostId: z.string().regex(/^urn:uuid:/),
  clientId: z.string().optional(),
  account: z.object({ subject: z.string().min(1), label: z.string().min(1) }).optional(),
  tokens: z.object({
    access: z.string().min(1), refresh: z.string().min(1).optional(), identity: z.string().min(1),
    expiresAt: z.number(), scopes: z.array(z.string()),
  }).optional(),
})
export type StoredAccount = z.infer<typeof schema>

export class AccountStore {
  constructor(private readonly directory: string) {}

  async load(): Promise<StoredAccount> {
    try {
      const value = await readFile(join(this.directory, 'account.dpapi'))
      return schema.parse(JSON.parse(decryptCredential(value)))
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error
      const record = { hostId: 'urn:uuid:' + randomUUID() }
      await this.save(record)
      return record
    }
  }

  async save(record: StoredAccount): Promise<void> {
    const encrypted = encryptCredential(JSON.stringify(schema.parse(record)))
    await mkdir(this.directory, { recursive: true })
    const temp = join(this.directory, 'account-' + randomUUID() + '.tmp')
    try {
      await writeFile(temp, encrypted, { flag: 'wx', mode: 0o600, flush: true })
      await rename(temp, join(this.directory, 'account.dpapi'))
    } finally {
      await rm(temp, { force: true })
    }
  }
}

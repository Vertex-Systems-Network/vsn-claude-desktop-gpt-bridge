import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { listProjectFiles, previewProjectFile } from '../src/main/projects/files'

it('lists and previews supported workspace files while rejecting linked and unsafe paths', async () => {
  const temp = await realpath(await mkdtemp(join(tmpdir(), 'deskagent-files-')))
  try {
    const root = join(temp, 'project')
    const outside = join(temp, 'outside')
    await mkdir(join(root, 'docs'), { recursive: true })
    await mkdir(outside)
    await writeFile(join(root, 'docs', 'notes.md'), '# Notes')
    await writeFile(join(root, '.env'), 'private')
    await writeFile(join(root, 'large.txt'), Buffer.alloc(128 * 1024 + 1))
    await writeFile(join(root, 'binary.txt'), Buffer.from([0]))
    await writeFile(join(outside, 'outside.md'), 'outside')
    await symlink(outside, join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir')
    expect((await listProjectFiles(root, [])).entries.map(({ name }) => name)).toEqual(['docs', 'binary.txt', 'large.txt'])
    await expect(previewProjectFile(root, ['docs', 'notes.md'])).resolves.toBe('# Notes')
    await expect(listProjectFiles(root, ['..'])).rejects.toThrow()
    await expect(previewProjectFile(root, ['linked', 'outside.md'])).rejects.toThrow()
    await expect(previewProjectFile(root, ['docs\\notes.md'])).rejects.toThrow()
    await expect(previewProjectFile(root, ['large.txt'])).rejects.toThrow()
    await expect(previewProjectFile(root, ['binary.txt'])).rejects.toThrow()
  } finally { await rm(temp, { recursive: true, force: true }) }
})

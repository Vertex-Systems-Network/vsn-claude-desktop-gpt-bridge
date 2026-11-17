import { lstat, open, opendir, realpath } from 'node:fs/promises'
import { extname, isAbsolute, join, relative } from 'node:path'
import type { ProjectEntry, ProjectListing } from '../../shared/project'

const textExtensions = new Set([
  '.txt', '.md', '.json', '.yaml', '.yml', '.toml', '.csv', '.xml', '.html',
  '.css', '.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.py', '.php', '.sql',
])
const maxBytes = 128 * 1024
const maxEntries = 300
const safeName = (part: string) => part.length <= 255 && part.length > 0 &&
  !part.startsWith('.') && !part.endsWith('.') && part.trim() === part &&
  !/[\\/:*?"<>|]/.test(part) && !part.includes('\0') &&
  !/^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(part)

export async function checkedPath(root: string, parts: string[]) {
  if (!isAbsolute(root) || /^[\\/]{2}/.test(root) || parts.length > 32 || !parts.every(safeName)) {
    throw new Error('Invalid project path.')
  }
  const rootInfo = await lstat(root)
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink() || relative(root, await realpath(root)) !== '') {
    throw new Error('The project folder moved or is unavailable.')
  }
  let target = root
  for (const part of parts) {
    target = join(target, part)
    if ((await lstat(target)).isSymbolicLink()) throw new Error('Linked paths are unavailable.')
  }
  if (relative(target, await realpath(target)) !== '') throw new Error('Linked paths are unavailable.')
  return target
}

export async function listProjectFiles(root: string, parts: string[]): Promise<ProjectListing> {
  const target = await checkedPath(root, parts)
  const directory = await opendir(target)
  const entries: ProjectEntry[] = []
  let truncated = false
  for await (const entry of directory) {
    if (!safeName(entry.name) || (!entry.isDirectory() && !entry.isFile())) continue
    if (entries.length >= maxEntries) {
      truncated = true
      break
    }
    entries.push({
      name: entry.name, kind: entry.isDirectory() ? 'directory' : 'file',
      previewable: entry.isFile() && textExtensions.has(extname(entry.name).toLowerCase()),
    })
  }
  await checkedPath(root, parts)
  entries.sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name))
  return { entries, truncated }
}

export async function previewProjectFile(root: string, parts: string[]): Promise<string> {
  if (!textExtensions.has(extname(parts.at(-1) ?? '').toLowerCase())) {
    throw new Error('Unsupported preview format.')
  }
  const target = await checkedPath(root, parts)
  const expected = await lstat(target, { bigint: true })
  if (!expected.isFile() || expected.nlink !== 1n || expected.size > BigInt(maxBytes)) {
    throw new Error('This file cannot be previewed.')
  }
  const handle = await open(target, 'r')
  try {
    const actual = await handle.stat({ bigint: true })
    if (!actual.isFile() || actual.dev !== expected.dev || actual.ino !== expected.ino ||
      actual.nlink !== 1n || actual.size > BigInt(maxBytes)) {
      throw new Error('The file changed before preview.')
    }
    await checkedPath(root, parts)
    const buffer = Buffer.alloc(maxBytes + 1)
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
    const data = buffer.subarray(0, bytesRead)
    if (bytesRead > maxBytes || data.includes(0)) throw new Error('This file cannot be previewed.')
    return new TextDecoder('utf-8', { fatal: true }).decode(data)
  } finally {
    await handle.close()
  }
}

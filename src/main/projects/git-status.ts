import { execFile } from 'node:child_process'
import { lstat, realpath } from 'node:fs/promises'
import { basename, isAbsolute, join, relative } from 'node:path'
import { promisify } from 'node:util'
import type { ProjectGitStatus } from '../../shared/project'
import { checkedPath } from './files'

const runGit = promisify(execFile)

export async function resolveGitExecutable(candidate: string): Promise<string> {
  if (!isAbsolute(candidate) || /^[\\/]{2}/.test(candidate)) throw new Error('Select an installed Git executable.')
  const executable = await realpath(candidate)
  if (/^[\\/]{2}/.test(executable) || basename(executable).toLowerCase() !== 'git.exe' ||
    !(await lstat(executable)).isFile()) throw new Error('Select an installed git.exe.')
  return executable
}

export function parseGitStatus(output: string): ProjectGitStatus {
  const records = output.split('\0')
  const header = records.shift()
  if (!header?.startsWith('## ')) throw new Error('Git reported an unexpected status format.')
  const changes: ProjectGitStatus['changes'] = []
  let index = 0
  while (index < records.length && records[index] && changes.length < 300) {
    const record = records[index++]
    if (record.length < 4 || record[2] !== ' ') throw new Error('Git reported an invalid file status.')
    const status = record.slice(0, 2)
    const path = record.slice(3)
    if (status.includes('R') || status.includes('C')) {
      const previousPath = records[index++]
      if (!previousPath) throw new Error('Git omitted the original filename.')
      changes.push({ status, path, previousPath })
    } else {
      changes.push({ status, path })
    }
  }
  return { branch: header.slice(3), changes, truncated: Boolean(records[index]) }
}

export async function readProjectGitStatus(root: string, executable: string): Promise<ProjectGitStatus> {
  const trusted = await resolveGitExecutable(executable)
  const folder = await checkedPath(root, [])
  const gitDir = join(folder, '.git')
  const metadata = await lstat(gitDir).catch(() => undefined)
  if (!metadata?.isDirectory() || metadata.isSymbolicLink() || relative(gitDir, await realpath(gitDir)) !== '') {
    throw new Error('Choose a Git repository root with a local .git directory.')
  }
  const redirectedMetadata = await lstat(join(gitDir, 'commondir')).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error
  })
  if (redirectedMetadata) throw new Error('Shared Git metadata is unavailable for project status.')
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^GIT_/i.test(key)))
  const settings = {
    cwd: folder, windowsHide: true, timeout: 8_000, maxBuffer: 1024 * 1024,
    env: { ...env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: 'NUL', GIT_TERMINAL_PROMPT: '0', GIT_NO_LAZY_FETCH: '1' },
  }
  const repository = ['--no-optional-locks', '--git-dir=' + gitDir, '--work-tree=' + folder]
  const configuration = await runGit(trusted, [...repository, 'config', '--local', '--no-includes', '--null', '--name-only', '--list'], settings)
  if (configuration.stdout.split('\0').some((key) => /^(filter\.|include\.|includeif\.|extensions\.worktreeconfig$)/i.test(key))) {
    throw new Error('This repository uses external Git filters, includes or worktree configuration. Status is unavailable.')
  }
  const { stdout } = await runGit(trusted, [
    ...repository,
    '-c', 'core.fsmonitor=false', '-c', 'core.untrackedCache=false',
    'status', '--porcelain=v1', '-z', '--branch', '--untracked-files=normal', '--ignore-submodules=all',
  ], settings)
  await checkedPath(root, [])
  return parseGitStatus(stdout)
}

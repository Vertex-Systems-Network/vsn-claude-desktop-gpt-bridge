import { expect, it } from 'vitest'
import { parseGitStatus } from '../src/main/projects/git-status'

it('preserves original paths and unusual filename whitespace in porcelain Git status', () => {
  const raw = ['## main...origin/main [ahead 1]', ' M notes.txt', 'R  new name', 'old name', '?? line\nbreak', ''].join('\0')
  expect(parseGitStatus(raw)).toEqual({
    branch: 'main...origin/main [ahead 1]',
    changes: [
      { status: ' M', path: 'notes.txt' },
      { status: 'R ', path: 'new name', previousPath: 'old name' },
      { status: '??', path: 'line\nbreak' },
    ],
    truncated: false,
  })
})

it('caps large working-tree lists and rejects a partial rename', () => {
  const raw = ['## main', ...Array.from({ length: 301 }, (_, index) => '?? item-' + index), ''].join('\0')
  const status = parseGitStatus(raw)
  expect(status.changes).toHaveLength(300)
  expect(status.truncated).toBe(true)
  expect(() => parseGitStatus(['## main', 'R  new name', ''].join('\0'))).toThrow('original filename')
})

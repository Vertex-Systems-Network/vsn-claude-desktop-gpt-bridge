import { describe, expect, it } from 'vitest'
import { runtimeInfo } from '../src/shared/desktop'

describe('runtime IPC response', () => {
  const info = { appVersion: '0.1.0', electronVersion: '42.0.0', platform: 'win32' }
  it('accepts displayable runtime metadata', () => expect(runtimeInfo.parse(info)).toEqual(info))
  it('rejects extra fields', () => expect(runtimeInfo.safeParse({ ...info, secret: 'test' }).success).toBe(false))
  it('rejects missing fields', () => expect(runtimeInfo.safeParse({ platform: 'win32' }).success).toBe(false))
})

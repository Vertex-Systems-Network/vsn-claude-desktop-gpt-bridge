import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { authorizeUrl, createAttempt, hasPlanGrant, openCallback, readCallback } from '../src/main/auth/oauth'

describe('SIWC browser authorization', () => {
  it('generates fresh secrets and binds the challenge to the verifier', () => {
    const attempt = createAttempt()
    expect(attempt.state).not.toBe(createAttempt().state)
    expect(attempt.nonce).not.toBe(attempt.state)
    expect(attempt.challenge).toBe(createHash('sha256').update(attempt.verifier).digest('base64url'))
  })

  it('uses dynamic registration or the saved client for explicit consent', () => {
    const attempt = createAttempt()
    const redirect = 'http://127.0.0.1:49152/auth/callback'
    const first = authorizeUrl(attempt, redirect, 'urn:uuid:host')
    const returning = authorizeUrl(attempt, redirect, 'urn:uuid:host', 'oaiapp_saved', undefined, true)
    expect(first.origin).toBe('https://auth.openai.com')
    expect(first.searchParams.get('client_id')).toBe('dynamic_agent_client')
    expect(first.searchParams.get('prompt')).toBeNull()
    expect(returning.searchParams.get('prompt')).toBe('consent')
    expect(returning.searchParams.get('client_id')).toBe('oaiapp_saved')
    expect(returning.searchParams.get('redirect_uri')).toBe(redirect)
    expect(returning.searchParams.has('agent_name_hint')).toBe(false)
  })

  it.each([
    ['state=wrong&code=one&client_id=oaiapp_saved', undefined],
    ['state=ok&state=ok&code=one&client_id=oaiapp_saved', undefined],
    ['state=ok&code=one&client_id=dynamic_agent_client', undefined],
    ['state=ok&code=one&client_id=oaiapp_other', 'oaiapp_saved'],
    ['state=ok&error=access_denied', undefined],
  ])('rejects invalid callbacks (%s)', (query, clientId) => {
    expect(() => readCallback(new URLSearchParams(query), 'ok', clientId)).toThrow()
  })

  it('uses the saved client when the callback omits it during reconnect', () => {
    expect(readCallback(new URLSearchParams('state=ok&code=one'), 'ok', 'oaiapp_saved'))
      .toEqual({ code: 'one', clientId: 'oaiapp_saved' })
  })

  it('accepts the first valid loopback response and rejects a replay', async () => {
    const listener = await openCallback('expected')
    try {
      const callback = listener.redirect + '?state=expected&client_id=oaiapp_saved&code=one'
      expect((await fetch(callback.replace('expected', 'wrong'))).status).toBe(400)
      expect((await fetch(callback)).status).toBe(200)
      await expect(listener.result).resolves.toEqual({ code: 'one', clientId: 'oaiapp_saved' })
      expect((await fetch(callback)).status).toBe(404)
    } finally {
      listener.close()
    }
  })

  it('requires the actual plan grant and renewable credentials', () => {
    const scopes = ['offline_access', 'resource.invoke', 'chatgpt.tokens.use.direct']
    expect(hasPlanGrant(scopes.slice(0, 2), 'refresh')).toBe(false)
    expect(hasPlanGrant(scopes)).toBe(false)
    expect(hasPlanGrant(scopes, 'refresh')).toBe(true)
  })
})

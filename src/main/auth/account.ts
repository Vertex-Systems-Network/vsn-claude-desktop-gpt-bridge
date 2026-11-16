import { shell } from 'electron'
import { z } from 'zod'
import type { AccountState, AccountStatus } from '../../shared/account'
import { AuthFailure, authorizeUrl, createAttempt, hasPlanGrant, issuer, openCallback, resource } from './oauth'
import { AccountStore, type StoredAccount } from './store'

const tokenResponse = z.object({
  access_token: z.string().min(1), refresh_token: z.string().min(1).optional(),
  id_token: z.string().min(1), token_type: z.string().regex(/^bearer$/i),
  expires_in: z.number().positive(), scope: z.string().optional(),
})
const discoveryUrl = issuer + '/.well-known/openid-configuration'

function providerUrl(value: string): URL {
  const url = new URL(value)
  if (url.origin !== issuer || url.username || url.password || url.hash) throw new Error('Unexpected OpenAI endpoint')
  return url
}

function fetchProvider(url: URL | string, options: RequestInit = {}) {
  return fetch(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(15_000) })
}

async function discover() {
  const response = await fetchProvider(discoveryUrl)
  if (!response.ok) throw new Error('OpenAI discovery is unavailable')
  return z.object({
    issuer: z.literal(issuer),
    jwks_uri: z.url(),
    revocation_endpoint: z.url().optional(),
    id_token_signing_alg_values_supported: z.array(z.string()).optional(),
  }).parse(await response.json())
}

export class AccountService {
  private record?: StoredAccount
  private status: AccountStatus = { state: 'SIGNED_OUT', busy: false }
  private cancelCallback?: () => void

  constructor(private readonly store: AccountStore) {}

  private set(state: AccountState, busy = false, message?: string, code?: string): AccountStatus {
    this.status = { state, busy, label: this.record?.account?.label, message, code }
    return this.status
  }

  private fromRecord(): AccountStatus {
    const tokens = this.record?.tokens
    if (!tokens) return this.set('SIGNED_OUT')
    if (!hasPlanGrant(tokens.scopes, tokens.refresh)) {
      return this.set('PLAN_PERMISSION_REQUIRED', false, 'Signed in successfully. ChatGPT plan usage has not been enabled.')
    }
    if (tokens.expiresAt <= Date.now()) {
      return this.set('RECONNECT_REQUIRED', false, 'Reconnect to renew ChatGPT access.')
    }
    return this.set('PLAN_CONNECTED', false, 'ChatGPT permission granted. Model access still needs verification.')
  }

  private report(error: unknown, fallback: string): AccountStatus {
    if (error instanceof AuthFailure) {
      return this.set('AUTH_ERROR', false, error.message, error.code)
    }
    return this.set('AUTH_ERROR', false, fallback, 'AUTH_UNAVAILABLE')
  }

  async initialize(): Promise<void> {
    try {
      this.record = await this.store.load()
      this.fromRecord()
    } catch {
      this.set('AUTH_ERROR', false, 'Windows could not open the protected account store.', 'AUTH_STORAGE_UNAVAILABLE')
    }
  }

  getStatus(): AccountStatus { return this.status }

  async signIn(consent: boolean): Promise<AccountStatus> {
    if (this.status.busy) return this.status
    if (consent && this.status.state !== 'PLAN_PERMISSION_REQUIRED') return this.status
    this.set('AUTH_STARTING', true)
    let listener: Awaited<ReturnType<typeof openCallback>> | undefined
    try {
      const previous = this.record ?? await this.store.load()
      const attempt = createAttempt()
      listener = await openCallback(attempt.state, previous.clientId)
      this.cancelCallback = listener.close
      const url = authorizeUrl(attempt, listener.redirect, previous.hostId, previous.clientId, previous.tokens?.identity, consent)
      this.set('BROWSER_OPENED', true, 'Opening your browser…')
      try {
        await shell.openExternal(url.href)
      } catch {
        throw new AuthFailure('AUTH_BROWSER_FAILED', 'Windows could not open your default browser.')
      }
      this.set('WAITING_FOR_CALLBACK', true, 'Complete sign-in in your browser.')
      const callback = await listener.result
      this.set('VALIDATING_CALLBACK', true, 'Verifying your OpenAI account…')
      const registered = { ...previous, clientId: callback.clientId }
      if (!previous.clientId) {
        await this.store.save(registered)
        this.record = registered
      }
      const response = await fetchProvider(issuer + '/api/accounts/oauth/token', {
        method: 'POST',
        body: new URLSearchParams({
          grant_type: 'authorization_code', client_id: callback.clientId, code: callback.code,
          code_verifier: attempt.verifier, redirect_uri: listener.redirect, resource,
        }),
      })
      if (!response.ok) {
        throw new AuthFailure('AUTH_TOKEN_EXCHANGE_FAILED', 'OpenAI could not exchange the authorization code. Try signing in again.')
      }
      const tokens = tokenResponse.parse(await response.json())
      const metadata = await discover()
      const { createRemoteJWKSet, jwtVerify } = await import('jose')
      const jwks = createRemoteJWKSet(providerUrl(metadata.jwks_uri), { timeoutDuration: 10_000 })
      const { payload } = await jwtVerify(tokens.id_token, jwks, {
        issuer, audience: callback.clientId, requiredClaims: ['sub', 'exp', 'iat', 'nonce'],
        clockTolerance: 5, algorithms: metadata.id_token_signing_alg_values_supported?.filter((alg) => /^(RS|PS|ES)\d+$/.test(alg)),
      }).catch(() => { throw new AuthFailure('AUTH_TOKEN_INVALID', 'The OpenAI identity token could not be verified.') })
      if (!payload.sub || payload.nonce !== attempt.nonce ||
        ((payload.azp !== undefined || (Array.isArray(payload.aud) && payload.aud.length > 1)) && payload.azp !== callback.clientId) ||
        (previous.account && previous.account.subject !== payload.sub)) {
        throw new AuthFailure('AUTH_TOKEN_INVALID', 'The returned identity did not match this sign-in attempt.')
      }
      const label = [payload.email, payload.name].find((value): value is string => typeof value === 'string' && !!value.trim()) ?? 'ChatGPT account'
      const verified: StoredAccount = {
        ...registered, account: { subject: payload.sub, label },
        tokens: {
          access: tokens.access_token, refresh: tokens.refresh_token, identity: tokens.id_token,
          expiresAt: Date.now() + tokens.expires_in * 1_000,
          scopes: tokens.scope?.split(/\s+/).filter(Boolean) ?? [],
        },
      }
      await this.store.save(verified)
      this.record = verified
      this.set('IDENTITY_CONNECTED', true)
      return this.fromRecord()
    } catch (error) {
      return this.report(error, 'OpenAI sign-in could not be verified or saved. Check your connection and try again.')
    } finally {
      listener?.close()
      this.cancelCallback = undefined
    }
  }

  cancel(): AccountStatus {
    if (this.status.state === 'WAITING_FOR_CALLBACK') this.cancelCallback?.()
    return this.status
  }

  async signOut(): Promise<AccountStatus> {
    const previous = this.record
    if (this.status.busy || !previous?.tokens) return this.status
    this.set(this.status.state, true, 'Disconnecting ChatGPT…')
    const { refresh } = previous.tokens
    const local = { ...previous, tokens: undefined }
    try {
      await this.store.save(local)
      this.record = local
    } catch {
      return this.set('AUTH_ERROR', false, 'Windows could not clear the saved credentials. Retry disconnect.', 'AUTH_STORAGE_UNAVAILABLE')
    }
    if (!refresh) return this.fromRecord()
    try {
      const metadata = await discover()
      if (!metadata.revocation_endpoint || !previous.clientId) throw new Error('Revocation endpoint unavailable')
      const response = await fetchProvider(providerUrl(metadata.revocation_endpoint), {
        method: 'POST',
        body: new URLSearchParams({ token: refresh, token_type_hint: 'refresh_token', client_id: previous.clientId }),
      })
      if (response.status !== 200) throw new Error('Revocation was not confirmed')
      return this.fromRecord()
    } catch {
      return this.set('SIGNED_OUT', false, 'Signed out on this device. OpenAI did not confirm remote revocation. You can disconnect DeskAgent in ChatGPT Settings.', 'AUTH_REVOCATION_UNCONFIRMED')
    }
  }
}

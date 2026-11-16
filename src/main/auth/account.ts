import { shell } from 'electron'
import { z } from 'zod'
import { checkPlan, PlanCheckError } from '../inference/plan-check'
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

const refreshResponse = tokenResponse.extend({
  id_token: z.string().min(1).optional(),
  refresh_token: z.string().min(1),
})
const invalidRefreshCodes = new Set([
  'invalid_grant', 'invalid_refresh_token', 'token_expired', 'refresh_token_expired',
  'refresh_token_invalidated', 'refresh_token_reused',
])
const exchangeUrl = issuer + '/api/accounts/oauth/token'

async function verifyIdentity(idToken: string, clientId: string, subject?: string, nonce?: string) {
  const metadata = await discover()
  const { createRemoteJWKSet, jwtVerify } = await import('jose')
  const jwks = createRemoteJWKSet(providerUrl(metadata.jwks_uri), { timeoutDuration: 10_000 })
  const { payload } = await jwtVerify(idToken, jwks, {
    issuer, audience: clientId, requiredClaims: ['sub', 'exp', 'iat'],
    clockTolerance: 5,
    algorithms: metadata.id_token_signing_alg_values_supported?.filter((alg) => /^(RS|PS|ES)\d+$/.test(alg)),
  })
  if (!payload.sub || (nonce !== undefined && payload.nonce !== nonce) ||
    ((payload.azp !== undefined || (Array.isArray(payload.aud) && payload.aud.length > 1)) && payload.azp !== clientId) ||
    (subject && subject !== payload.sub)) {
    throw new AuthFailure('AUTH_TOKEN_INVALID', 'The returned identity did not match the saved registration.')
  }
  return { subject: payload.sub, label: [payload.email, payload.name].find(
    (value): value is string => typeof value === 'string' && !!value.trim(),
  ) }
}

function grantedScopes(scope: string | undefined, previous: string[] = []): string[] {
  return scope?.split(/\s+/).filter(Boolean) ?? previous
}

export class AccountService {
  private record?: StoredAccount
  private status: AccountStatus = { state: 'SIGNED_OUT', busy: false }
  private cancelCallback?: () => void

  constructor(private readonly store: AccountStore) {}

  private set(state: AccountState, busy = false, message?: string, code?: string): AccountStatus {
    const tokens = this.record?.tokens
    const canRefresh = Boolean(tokens?.refresh && (tokens.needsIdentityVerification || hasPlanGrant(tokens.scopes, tokens.refresh)))
    this.status = { state, busy, canRefresh, label: this.record?.account?.label, message, code }
    return this.status
  }

  private fromRecord(): AccountStatus {
    const tokens = this.record?.tokens
    if (!tokens) return this.set('SIGNED_OUT')
    if (tokens.needsIdentityVerification) {
      return this.set('RECONNECT_REQUIRED', false, 'Verify the renewed ChatGPT session before continuing.')
    }
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
      const response = await fetchProvider(exchangeUrl, {
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
      const identity = await verifyIdentity(tokens.id_token, callback.clientId, previous.account?.subject, attempt.nonce)
        .catch(() => { throw new AuthFailure('AUTH_TOKEN_INVALID', 'The OpenAI identity token could not be verified.') })
      const verified: StoredAccount = {
        ...registered, account: { subject: identity.subject, label: identity.label ?? 'ChatGPT account' },
        tokens: {
          access: tokens.access_token, refresh: tokens.refresh_token, identity: tokens.id_token,
          expiresAt: Date.now() + tokens.expires_in * 1_000,
          scopes: grantedScopes(tokens.scope),
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

  async refresh(): Promise<AccountStatus> {
    const previous = this.record
    const tokens = previous?.tokens
    if (this.status.busy || !previous?.clientId || !previous.account ||
      !tokens?.refresh || (!tokens.needsIdentityVerification && !hasPlanGrant(tokens.scopes, tokens.refresh))) {
      return this.status
    }
    this.set('TOKEN_REFRESHING', true, 'Checking the ChatGPT session…')
    try {
      if (!tokens.needsIdentityVerification && tokens.expiresAt > Date.now() + 60_000) return this.fromRecord()
      let updated = tokens
      if (!tokens.needsIdentityVerification) {
        const response = await fetchProvider(exchangeUrl, {
          method: 'POST',
          body: new URLSearchParams({
            grant_type: 'refresh_token', client_id: previous.clientId, refresh_token: tokens.refresh, resource,
          }),
        })
        if (!response.ok) {
          const body: unknown = await response.json().catch(() => null)
          const error = z.object({ error: z.union([z.string(), z.object({ code: z.string() })]) }).safeParse(body)
          const code = error.success && (typeof error.data.error === 'string' ? error.data.error : error.data.error.code)
          if (code && invalidRefreshCodes.has(code)) {
            const local = { ...previous, tokens: undefined }
            await this.store.save(local)
            this.record = local
            return this.set('RECONNECT_REQUIRED', false, 'The saved ChatGPT session expired or was revoked. Sign in again.', 'AUTH_REFRESH_FAILED')
          }
          throw new AuthFailure('AUTH_REFRESH_FAILED', 'OpenAI could not renew the session. Try again when the service is available.')
        }
        const renewed = refreshResponse.parse(await response.json())
        updated = {
          access: renewed.access_token, refresh: renewed.refresh_token, identity: renewed.id_token ?? tokens.identity,
          expiresAt: Date.now() + renewed.expires_in * 1_000,
          scopes: grantedScopes(renewed.scope, tokens.scopes), needsIdentityVerification: Boolean(renewed.id_token),
        }
        // Preserve rotated credentials before any remote signing-key lookup.
        const next = { ...previous, tokens: updated }
        this.record = next
        await this.store.save(next)
      }
      if (updated.needsIdentityVerification) {
        await verifyIdentity(updated.identity, previous.clientId, previous.account.subject)
        const verified = { ...previous, tokens: { ...updated, needsIdentityVerification: false } }
        await this.store.save(verified)
        this.record = verified
      }
      return this.fromRecord()
    } catch (error) {
      return this.report(error, 'DeskAgent could not verify or save the renewed session. Reconnect if retrying does not help.')
    }
  }

  async chatAccessToken(): Promise<string> {
    let tokens = this.record?.tokens
    if (this.status.busy || !tokens || !hasPlanGrant(tokens.scopes, tokens.refresh) ||
      !['READY', 'PLAN_CONNECTED', 'RECONNECT_REQUIRED'].includes(this.status.state)) {
      throw new PlanCheckError('CHAT_AUTH_REQUIRED')
    }
    if (tokens.needsIdentityVerification || tokens.expiresAt <= Date.now() + 60_000) {
      const status = await this.refresh()
      tokens = this.record?.tokens
      if (status.state !== 'PLAN_CONNECTED' || !tokens || tokens.expiresAt <= Date.now()) {
        throw new PlanCheckError('CHAT_AUTH_REQUIRED')
      }
    }
    return tokens.access
  }

  async verifyPlan(): Promise<AccountStatus> {
    if (this.status.busy || !['PLAN_CONNECTED', 'READY'].includes(this.status.state)) return this.status
    const tokens = this.record?.tokens
    if (!tokens || tokens.needsIdentityVerification || !hasPlanGrant(tokens.scopes, tokens.refresh)) return this.fromRecord()
    if (tokens.expiresAt <= Date.now()) return this.fromRecord()
    this.set('MODEL_LOADING', true, 'Checking available models and waiting for a completed GPT response…')
    try {
      const model = await checkPlan(tokens.access)
      this.set('READY', false, 'ChatGPT plan connected.')
      this.status = { ...this.status, verifiedModel: model.display_name }
      return this.status
    } catch (error) {
      if (!(error instanceof PlanCheckError)) {
        return this.set('PLAN_CONNECTED', false, 'DeskAgent could not complete the plan check. Try again.', 'INFERENCE_UNAVAILABLE')
      }
      const diagnostic = error.requestId ? error.code + ' (' + error.requestId + ')' : error.code
      if (error.code === 'subscription_sharing_user_not_eligible') {
        return this.set('ACCOUNT_INELIGIBLE', false, 'ChatGPT plan usage is unavailable for this account or workspace.', diagnostic)
      }
      if (error.httpStatus === 401) {
        return this.set('RECONNECT_REQUIRED', false, 'OpenAI did not accept this session. Reconnect before checking access again.', diagnostic)
      }
      if (error.code === 'subscription_sharing_usage_limit_exceeded') {
        return this.set('PLAN_CONNECTED', false, 'The plan usage limit has been reached. Try again when ChatGPT shows that usage is available.', diagnostic)
      }
      const message = error.code === 'MODEL_UNAVAILABLE' ? 'OpenAI returned no visible models for this account.'
        : 'OpenAI did not complete the plan check. Review the diagnostic and try again when appropriate.'
      return this.set('PLAN_CONNECTED', false, message, diagnostic)
    }
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

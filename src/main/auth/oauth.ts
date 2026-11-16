import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer } from 'node:http'

export const issuer = 'https://auth.openai.com'
export const resource = 'https://api.openai.com/v1'
export const dynamicClient = 'dynamic_agent_client'
export const callbackPath = '/auth/callback'
const planScopes = ['offline_access', 'resource.invoke', 'chatgpt.tokens.use.direct']
const random = () => randomBytes(32).toString('base64url')

export class AuthFailure extends Error {
  constructor(readonly code: string, message: string) { super(message) }
}

export function hasPlanGrant(scopes: string[], refreshToken?: string): boolean {
  return Boolean(refreshToken) && planScopes.every((scope) => scopes.includes(scope))
}

export function createAttempt() {
  const verifier = random()
  return { state: random(), nonce: random(), verifier, challenge: createHash('sha256').update(verifier).digest('base64url') }
}

export function authorizeUrl(attempt: ReturnType<typeof createAttempt>, redirect: string, hostId: string, clientId?: string, idToken?: string, consent = false) {
  const url = new URL('/api/accounts/authorize', issuer)
  url.search = new URLSearchParams({
    client_id: clientId ?? dynamicClient,
    ext_agent_host_id: hostId,
    response_type: 'code',
    redirect_uri: redirect,
    scope: ['openid', 'profile', 'email', ...planScopes].join(' '),
    resource,
    state: attempt.state,
    nonce: attempt.nonce,
    code_challenge_method: 'S256',
    code_challenge: attempt.challenge,
  }).toString()
  if (!clientId) url.searchParams.set('agent_name_hint', 'DeskAgent')
  if (clientId && idToken) url.searchParams.set('id_token_hint', idToken)
  if (consent) url.searchParams.set('prompt', 'consent')
  return url
}

export function readCallback(params: URLSearchParams, state: string, savedClientId?: string) {
  const actual = Buffer.from(params.get('state') ?? '')
  const expected = Buffer.from(state)
  if (params.getAll('state').length !== 1 || actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new AuthFailure('AUTH_STATE_INVALID', 'The browser response did not match this sign-in attempt.')
  }
  if (params.has('error')) {
    if (params.get('error') === 'access_denied') throw new AuthFailure('AUTH_CANCELLED', 'Authorization was declined in the browser.')
    throw new AuthFailure('AUTH_PROVIDER_ERROR', 'OpenAI could not complete authorization.')
  }
  const issued = params.get('client_id')
  const clientId = issued ?? savedClientId
  const code = params.get('code')
  if (!code || params.getAll('code').length !== 1 || params.getAll('client_id').length > 1 ||
    !clientId || !/^oaiapp_[A-Za-z0-9_-]+$/.test(clientId) || (savedClientId && clientId !== savedClientId)) {
    throw new AuthFailure('AUTH_CALLBACK_INVALID', 'The browser did not return a valid authorization code and client registration.')
  }
  return { code, clientId }
}

export async function openCallback(state: string, savedClientId?: string) {
  let resolveResult!: (value: ReturnType<typeof readCallback>) => void
  let rejectResult!: (error: Error) => void
  let settled = false
  const result = new Promise<ReturnType<typeof readCallback>>((resolve, reject) => {
    resolveResult = resolve
    rejectResult = reject
  })
  // Browser launch and callback may fail independently.
  void result.catch(() => undefined)
  let authority = ''
  const server = createServer((req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.setHeader('Referrer-Policy', 'no-referrer')
    res.setHeader('Connection', 'close')
    const raw = req.url ?? ''
    if (settled || req.method !== 'GET' || req.headers.host !== authority || !raw.startsWith(callbackPath + '?')) {
      res.writeHead(404).end('Not found.')
      return
    }
    try {
      const callback = readCallback(new URLSearchParams(raw.slice(callbackPath.length + 1)), state, savedClientId)
      settled = true
      res.end('DeskAgent received the browser response. Return to DeskAgent to finish connecting.')
      resolveResult(callback)
    } catch (error) {
      res.writeHead(400).end('DeskAgent could not accept this authorization response.')
      if (error instanceof AuthFailure && error.code !== 'AUTH_STATE_INVALID') {
        settled = true
        rejectResult(error)
      }
    }
  })
  server.requestTimeout = 10_000
  server.headersTimeout = 5_000
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string') {
    server.close()
    throw new Error('Expected an IPv4 callback listener')
  }
  authority = '127.0.0.1:' + address.port
  const timer = setTimeout(() => {
    settled = true
    rejectResult(new AuthFailure('AUTH_CALLBACK_TIMEOUT', 'The browser sign-in timed out. Start a new attempt.'))
    server.close()
    server.closeAllConnections()
  }, 180_000)
  return {
    redirect: 'http://' + authority + callbackPath,
    result,
    close() {
      clearTimeout(timer)
      server.close()
      if (!settled) {
        settled = true
        rejectResult(new AuthFailure('AUTH_CANCELLED', 'The sign-in attempt was cancelled.'))
        server.closeAllConnections()
      }
    },
  }
}

import { useEffect, useState } from 'react'
import type { AccountStatus } from '../../shared/account'

export function AccountPanel() {
  const [status, setStatus] = useState<AccountStatus>()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(false)
  const bridge = window.deskAgent

  useEffect(() => {
    let active = true
    const update = () => {
      void bridge.getAccountStatus().then(
        (next) => { if (active) setStatus(next) },
        () => { if (active) setError(true) },
      )
    }
    update()
    const timer = pending ? setInterval(update, 250) : undefined
    return () => { active = false; clearInterval(timer) }
  }, [bridge, pending])

  async function run(action: () => Promise<AccountStatus>) {
    setPending(true)
    setError(false)
    try {
      setStatus(await action())
    } catch {
      setError(true)
    } finally {
      setPending(false)
    }
  }

  const requireConsent = status?.state === 'PLAN_PERMISSION_REQUIRED'
  const canVerify = status?.state === 'PLAN_CONNECTED' || status?.state === 'READY'
  const canSignIn = !canVerify && status?.state !== 'ACCOUNT_INELIGIBLE'
  const canCancel = pending && status?.state === 'WAITING_FOR_CALLBACK'

  return (
    <section className="mt-8 rounded-xl border p-6" aria-labelledby="account-heading">
      <h1 id="account-heading" className="text-3xl font-semibold">ChatGPT account</h1>
      <p className="mt-3 muted">Sign in in your default browser and choose whether DeskAgent can use your eligible ChatGPT plan.</p>
      <div className="mt-4" aria-live="polite">
        {status?.label && <p>{status.label}</p>}
        <p>{status?.message ?? (status ? 'Signed out' : 'Checking local account…')}</p>
        {status?.verifiedModel && <p>Verified model: {status.verifiedModel}</p>}
        {status?.code && <p className="muted">{status.code}</p>}
      </div>
      {error && <p role="alert">The desktop account service could not be reached.</p>}
      <div className="mt-4 flex flex-wrap gap-3">
        {canSignIn && <button type="button" disabled={pending || !status} onClick={() => {
          void run(requireConsent ? bridge.enablePlan : bridge.signIn)
        }}>
          {requireConsent ? 'Enable ChatGPT plan usage' : 'Continue with ChatGPT'}
        </button>}
        {canVerify && <button type="button" disabled={pending} onClick={() => {
          void run(bridge.verifyPlan)
        }}>Verify plan access</button>}
        {status?.canRefresh && <button type="button" disabled={pending} onClick={() => {
          void run(bridge.refreshAccount)
        }}>Check session</button>}
        {status?.label && status.state !== 'SIGNED_OUT' && <button type="button" disabled={pending} onClick={() => {
          void run(bridge.signOut)
        }}>Disconnect</button>}
        {canCancel && <button type="button" onClick={() => {
          void bridge.cancelSignIn().catch(() => setError(true))
        }}>Cancel sign-in</button>}
        {error && <button type="button" disabled={pending} onClick={() => {
          void run(bridge.getAccountStatus)
        }}>Refresh account status</button>}
      </div>
    </section>
  )
}

import { useState } from 'react'
import type { McpDiscovery } from '../../shared/mcp'

export function McpPanel() {
  const bridge = window.deskAgent
  const [executable, setExecutable] = useState('')
  const [args, setArgs] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<McpDiscovery>()

  async function choose() {
    setBusy(true)
    setError('')
    try {
      const path = await bridge.chooseMcpExecutable()
      if (path) { setExecutable(path); setResult(undefined) }
    } catch { setError('DeskAgent could not open this executable.') }
    finally { setBusy(false) }
  }

  async function discover() {
    if (!executable || busy) return
    const values = args.split(/\r?\n/).filter((line) => line.length > 0)
    if (values.length > 20 || values.some((line) => line.length > 1024)) {
      setError('Enter up to 20 arguments, each at most 1,024 characters.')
      return
    }
    setBusy(true)
    setError('')
    setResult(undefined)
    try {
      const discovery = await bridge.discoverMcp({ executable, args: values })
      if (discovery) setResult(discovery)
    } catch { setError('MCP discovery failed. Check that this executable and its arguments start a stdio MCP server.') }
    finally { setBusy(false) }
  }

  return (
    <section className="mt-8 grid gap-3 rounded-xl border p-6" aria-labelledby="mcp-heading">
      <h2 id="mcp-heading" className="text-2xl font-semibold">Local MCP tools</h2>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={busy} onClick={() => { void choose() }}>Choose executable</button>
        {executable && <span className="break-all">{executable}</span>}
      </div>
      {executable && <label className="grid gap-2">
        Arguments, one per line
        <textarea className="rounded border bg-transparent p-2" rows={3} value={args} maxLength={20500} disabled={busy}
          onChange={(event) => { setArgs(event.target.value); setResult(undefined) }} />
      </label>}
      <button type="button" className="justify-self-start" disabled={!executable || busy}
        onClick={() => { void discover() }}>Discover tools</button>
      {busy && <p className="muted" role="status">Waiting for local discovery…</p>}
      {error && <p role="alert">{error}</p>}
      {result && <p className="muted" role="status">{result.tools.length ? 'Discovery complete. The server connection is closed.' : 'The server did not publish tools.'}</p>}
      {result?.truncated && <p className="muted">Showing the first page of up to 100 tools.</p>}
      {!!result?.tools.length && <ul className="grid gap-2">
        {result.tools.map((tool, index) => <li className="rounded border p-3" key={index}>
          <strong className="break-all">{tool.name}</strong>
          {tool.description && <p className="whitespace-pre-wrap break-words">{tool.description}</p>}
        </li>)}
      </ul>}
    </section>
  )
}

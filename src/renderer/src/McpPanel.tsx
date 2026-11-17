import { useEffect, useState } from 'react'
import type { McpCallResult, McpDiscovery, McpProfile } from '../../shared/mcp'

export function McpPanel() {
  const bridge = window.deskAgent
  const [profiles, setProfiles] = useState<McpProfile[]>([])
  const [profileId, setProfileId] = useState('')
  const [name, setName] = useState('')
  const [executable, setExecutable] = useState('')
  const [args, setArgs] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [tool, setTool] = useState('')
  const [toolArgs, setToolArgs] = useState('{}')
  const [toolResult, setToolResult] = useState<McpCallResult>()
  const [result, setResult] = useState<McpDiscovery>()

  useEffect(() => {
    let active = true
    void bridge.listMcpProfiles().then(
      (items) => { if (active) setProfiles(items) },
      () => { if (active) setError('DeskAgent could not open saved MCP profiles.') },
    )
    return () => { active = false }
  }, [bridge])

  function pickProfile(id: string) {
    const profile = profiles.find((item) => item.id === id)
    setProfileId(profile?.id ?? '')
    setName(profile?.name ?? '')
    setExecutable(profile?.executable ?? '')
    setArgs(profile?.args.join('\n') ?? '')
    setResult(undefined); setTool(''); setToolResult(undefined)
    setError('')
  }

  function argumentsList() {
    const values = args.split(/\r?\n/).filter((line) => line.length > 0)
    if (values.length > 20 || values.some((line) => line.length > 1024)) {
      setError('Enter up to 20 arguments, each at most 1,024 characters.')
      return
    }
    return values
  }

  async function saveProfile() {
    const values = argumentsList()
    if (!values || !name.trim() || !executable || busy) return
    setBusy(true)
    setError('')
    try {
      const saved = await bridge.saveMcpProfile({ id: profileId || undefined, name, executable, args: values })
      setProfiles((items) => [...items.filter(({ id }) => id !== saved.id), saved]
        .sort((left, right) => left.name.localeCompare(right.name)))
      setProfileId(saved.id)
      setName(saved.name)
      setExecutable(saved.executable)
    } catch (failure) {
      setError(failure instanceof Error && failure.message.includes('already uses this name')
        ? 'A server profile already uses this name.' : 'DeskAgent could not save this MCP profile.')
    } finally { setBusy(false) }
  }

  async function removeProfile() {
    if (!profileId || busy || !window.confirm('Remove this saved server profile?')) return
    setBusy(true)
    setError('')
    try {
      await bridge.removeMcpProfile(profileId)
      setProfiles((items) => items.filter(({ id }) => id !== profileId))
      pickProfile('')
    } catch { setError('DeskAgent could not remove this MCP profile.') }
    finally { setBusy(false) }
  }

  async function choose() {
    setBusy(true)
    setError('')
    try {
      const path = await bridge.chooseMcpExecutable()
      if (path) { setExecutable(path); setResult(undefined); setTool(''); setToolResult(undefined) }
    } catch { setError('DeskAgent could not open this executable.') }
    finally { setBusy(false) }
  }

  async function discover() {
    if (!executable || busy) return
    const values = argumentsList()
    if (!values) return
    setBusy(true)
    setError('')
    setResult(undefined); setTool(''); setToolResult(undefined)
    try {
      const discovery = await bridge.discoverMcp({ executable, args: values })
      if (discovery) setResult(discovery)
    } catch { setError('MCP discovery failed. Check that this executable and its arguments start a stdio MCP server.') }
    finally { setBusy(false) }
  }

  async function callTool() {
    const values = argumentsList()
    if (!values || !tool || !result?.tools.some(({ name }) => name === tool) || busy) return
    setBusy(true)
    setError('')
    setToolResult(undefined)
    try {
      const output = await bridge.callMcp({ executable, args: values, tool, argumentsJson: toolArgs })
      if (output) setToolResult(output)
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : ''
      setError(message.includes('Arguments do not match')
        ? 'Arguments do not match the tool schema.' : 'MCP call failed. Check the JSON arguments and server.')
    } finally { setBusy(false) }
  }

  return (
    <section className="mt-8 grid gap-3 rounded-xl border p-6" aria-labelledby="mcp-heading">
      <h2 id="mcp-heading" className="text-2xl font-semibold">Local MCP tools</h2>
      <label className="grid gap-2">
        Server profile
        <select className="rounded border bg-transparent p-2" value={profileId} disabled={busy}
          onChange={(event) => pickProfile(event.target.value)}>
          <option value="">New server profile</option>
          {profiles.map(({ id, name }) => <option value={id} key={id}>{name}</option>)}
        </select>
      </label>
      <label className="grid gap-2">
        Profile name
        <input className="rounded border bg-transparent p-2" value={name} maxLength={80} disabled={busy}
          onChange={(event) => setName(event.target.value)} />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={busy} onClick={() => { void choose() }}>Choose executable</button>
        {executable && <span className="break-all">{executable}</span>}
      </div>
      {executable && <label className="grid gap-2">
        Arguments, one per line
        <textarea className="rounded border bg-transparent p-2" rows={3} value={args} maxLength={20500} disabled={busy}
          onChange={(event) => { setArgs(event.target.value); setResult(undefined); setTool(''); setToolResult(undefined) }} />
      </label>}
      <div className="flex flex-wrap gap-3">
        <button type="button" disabled={!executable || busy} onClick={() => { void discover() }}>Discover tools</button>
        <button type="button" disabled={!executable || !name.trim() || busy} onClick={() => {
          void saveProfile()
        }}>{profileId ? 'Update profile' : 'Save profile'}</button>
        {profileId && <button type="button" disabled={busy} onClick={() => { void removeProfile() }}>Remove profile</button>}
      </div>
      {busy && <p className="muted" role="status">Working…</p>}
      {error && <p role="alert">{error}</p>}
      {result && <p className="muted" role="status">{result.tools.length ? 'Tools discovered. Running a tool opens a new connection.' : 'The server did not publish tools.'}</p>}
      {result?.truncated && <p className="muted">Showing the first page of up to 100 tools.</p>}
      {!!result?.tools.length && <ul className="grid gap-2">
        {result.tools.map((tool, index) => <li className="rounded border p-3" key={index}>
          <strong className="break-all">{tool.name}</strong>
          {tool.description && <p className="whitespace-pre-wrap break-words">{tool.description}</p>}
        </li>)}
      </ul>}
      {!!result?.tools.length && <div className="grid gap-3 rounded border p-4">
        <label className="grid gap-2">Tool
          <select className="rounded border bg-transparent p-2" disabled={busy} value={tool}
            onChange={(event) => { setTool(event.target.value); setToolResult(undefined) }}>
            <option value="">Select a tool</option>
            {result.tools.map(({ name }, index) => <option key={index} value={name}>{name}</option>)}
          </select>
        </label>
        <label className="grid gap-2">Tool arguments (JSON object)
          <textarea className="rounded border bg-transparent p-2" rows={3} value={toolArgs} maxLength={8000}
            disabled={busy} onChange={(event) => setToolArgs(event.target.value)} />
        </label>
        <button type="button" className="justify-self-start" disabled={busy || !tool}
          onClick={() => { void callTool() }}>Run tool</button>
        {toolResult && <div className="grid gap-2" aria-live="polite">
          <strong>{toolResult.failed ? 'Tool reported an error' : 'Tool output'}</strong>
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all">{toolResult.text}</pre>
          {toolResult.truncated && <p className="muted">Output shortened to 16,000 characters.</p>}
        </div>}
      </div>}
    </section>
  )
}

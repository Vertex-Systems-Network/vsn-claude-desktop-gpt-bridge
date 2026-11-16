import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { maxPromptLength } from '../../shared/chat'
import type { ChatSnapshot, SavedChat } from '../../shared/chat'

export function ChatPanel({ onBusy }: { onBusy: (busy: boolean) => void }) {
  const bridge = window.deskAgent
  const [chat, setChat] = useState<ChatSnapshot>({ models: [], turns: [], busy: false })
  const [pending, setPending] = useState<'models' | 'send' | 'clear' | 'open'>()
  const [model, setModel] = useState('')
  const [prompt, setPrompt] = useState('')
  const [query, setQuery] = useState('')
  const [matches, setMatches] = useState<SavedChat[]>()
  const [exporting, setExporting] = useState(false)
  const [notice, setNotice] = useState('')
  const selected = chat.models.find((option) => option.slug === model)?.slug ?? ''
  const busy = Boolean(pending || chat.busy)

  useEffect(() => { onBusy(busy) }, [busy, onBusy])
  useEffect(() => {
    let active = true
    const update = () => {
      void bridge.getChat().then(
        (snapshot) => { if (active) setChat(snapshot) },
        () => { if (active) setNotice('DeskAgent could not read the chat state.') },
      )
    }
    update()
    const timer = pending ? setInterval(update, 120) : undefined
    return () => { active = false; clearInterval(timer) }
  }, [bridge, pending])

  async function run(operation: 'models' | 'send' | 'clear' | 'open', action: () => Promise<ChatSnapshot>) {
    if (busy) return
    setPending(operation)
    setNotice('')
    try {
      const next = await action()
      setChat(next)
      if (operation === 'models') setModel(next.models.find(({ slug }) => slug === model)?.slug ?? next.models[0]?.slug ?? '')
      if (operation === 'send' && next.turns.length > chat.turns.length) setPrompt('')
    } catch {
      setNotice('The desktop chat request failed. You can try again.')
    } finally {
      setPending(undefined)
    }
  }

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try { setMatches(await bridge.searchChats(query)) }
    catch { setNotice('DeskAgent could not search local history.') }
  }

  async function exportConversation(format: 'md' | 'json') {
    setExporting(true)
    setNotice('')
    try {
      if (await bridge.exportChat(format)) setNotice('Conversation exported.')
    } catch { setNotice('DeskAgent could not save the export file.') }
    finally { setExporting(false) }
  }

  function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (selected && prompt.trim()) void run('send', () => bridge.sendChat(selected, prompt))
  }

  return (
    <section className="mt-8 rounded-xl border p-6" aria-labelledby="chat-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="chat-heading" className="text-2xl font-semibold">Chat workspace</h2>
        <button type="button" disabled={busy || !chat.turns.length} onClick={() => {
          void run('clear', bridge.clearChat)
        }}>New chat</button>
      </div>
      {!!chat.saved?.length && (
        <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={search}>
          <label className="grid gap-2">
            Search saved chats
            <input type="search" maxLength={160} value={query} className="rounded border bg-transparent p-2"
              onChange={(event) => { setQuery(event.target.value); setMatches(undefined) }} />
          </label>
          <button type="submit" disabled={busy || !query.trim()}>Search</button>
        </form>
      )}
      {matches && !matches.length && <p className="mt-3 muted" role="status">No chats matched the search.</p>}
      {!!chat.saved?.length && (
        <label className="mt-4 grid gap-2">
          Recent chats
          <select className="rounded border bg-transparent p-2" value={(matches ?? chat.saved).some(({ id }) => id === chat.conversation) ? chat.conversation : ''} disabled={busy}
            onChange={(event) => { const id = event.target.value; void run('open', () => bridge.openChat(id)) }}>
            <option value="" disabled>Choose a saved chat</option>
            {(matches ?? chat.saved).map(({ id, title }) => <option key={id} value={id}>{title}</option>)}
          </select>
        </label>
      )}
      {chat.conversation && <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" disabled={busy || exporting} onClick={() => { void exportConversation('md') }}>Export Markdown</button>
        <button type="button" disabled={busy || exporting} onClick={() => { void exportConversation('json') }}>Export JSON</button>
      </div>}
      {chat.historyError && <p className="mt-4" role="alert">{chat.historyError}</p>}
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="grid min-w-52 gap-2">
          Model
          <select className="rounded border bg-transparent p-2" disabled={busy || !chat.models.length}
            value={selected} onChange={(event) => setModel(event.target.value)}>
            <option value="" disabled>Choose a model</option>
            {chat.models.map((option) => <option key={option.slug} value={option.slug}>{option.display_name}</option>)}
          </select>
        </label>
        <button type="button" disabled={busy} onClick={() => { void run('models', bridge.loadChatModels) }}>
          {pending === 'models' ? 'Loading models…' : chat.models.length ? 'Refresh models' : 'Load models'}
        </button>
      </div>
      {!chat.models.length && <p className="mt-4 muted">Connect your ChatGPT account, then load its available models.</p>}
      <ol className="mt-5 grid gap-4" aria-label="Conversation">
        {chat.turns.map((turn, index) => (
          <li className="rounded border p-4" key={index}>
            <p className="font-semibold">You</p>
            <p className="mt-1 whitespace-pre-wrap break-words">{turn.prompt}</p>
            <p className="mt-4 font-semibold">Assistant</p>
            <p className="mt-1 whitespace-pre-wrap break-words">{turn.reply}</p>
            {turn.phase !== 'complete' && <p className="mt-2 muted" role="status">
              {turn.phase === 'streaming' ? 'Generating…' : turn.phase === 'stopped' ? 'Stopped' : 'Reply incomplete'}
            </p>}
          </li>
        ))}
      </ol>
      {notice && <p className="mt-4" role="status">{notice}</p>}
      {chat.error && <p className="mt-4" role="alert">{chat.error}</p>}
      <form className="mt-5 grid gap-3" onSubmit={send}>
        <label htmlFor="chat-prompt">Message</label>
        <textarea id="chat-prompt" rows={4} className="w-full rounded border bg-transparent p-3"
          disabled={busy || !selected} value={prompt} maxLength={maxPromptLength}
          onChange={(event) => setPrompt(event.target.value)} />
        <div className="flex gap-3">
          <button type="submit" disabled={busy || !selected || !prompt.trim()}>Send</button>
          {(pending === 'send' || chat.turns.at(-1)?.phase === 'streaming') && (
            <button type="button" onClick={() => {
              void bridge.stopChat().catch(() => setNotice('The stop request failed.'))
            }}>Stop</button>
          )}
        </div>
      </form>
    </section>
  )
}

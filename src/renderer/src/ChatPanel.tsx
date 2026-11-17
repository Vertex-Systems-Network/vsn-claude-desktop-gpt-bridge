import { useEffect, useState } from 'react'
import type { Project, ProjectAttachment } from '../../shared/project'
import type { FormEvent } from 'react'
import { maxPromptLength } from '../../shared/chat'
import type { ChatChange, ChatSnapshot, SavedChat } from '../../shared/chat'

export function ChatPanel({ onBusy, projects, attachment, onClearAttachment, prompt, onPrompt: setPrompt }: {
  onBusy: (busy: boolean) => void
  projects: Project[]
  prompt: string
  onPrompt: (prompt: string) => void
  attachment?: ProjectAttachment
  onClearAttachment: () => void
}) {
  const bridge = window.deskAgent
  const [chat, setChat] = useState<ChatSnapshot>({ models: [], turns: [], busy: false })
  const [pending, setPending] = useState<'models' | 'send' | 'clear' | 'open' | 'change'>()
  const [model, setModel] = useState('')
  const [query, setQuery] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [rename, setRename] = useState<string>()
  const [matches, setMatches] = useState<SavedChat[]>()
  const [exporting, setExporting] = useState(false)
  const [notice, setNotice] = useState('')
  const selected = chat.models.find((option) => option.slug === model)?.slug ?? ''
  const busy = Boolean(pending || chat.busy)
  const attachmentMatches = !attachment || (!chat.temporary && attachment.projectId === chat.projectId && projects.some(({ id, folder }) =>
    id === attachment.projectId && folder === attachment.folder))
  const visibleChats = matches ?? (showArchived ? chat.archived : chat.saved) ?? []

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

  async function run(operation: 'models' | 'send' | 'clear' | 'open' | 'change', action: () => Promise<ChatSnapshot>) {
    if (busy) return
    setPending(operation)
    setNotice('')
    try {
      const next = await action()
      setChat(next)
      if (operation === 'clear' || operation === 'open' || operation === 'change') setRename(undefined)
      if (operation === 'change') setMatches(undefined)
      if (operation === 'models') setModel(next.models.find(({ slug }) => slug === model)?.slug ?? next.models[0]?.slug ?? '')
      if ((operation === 'clear' || operation === 'open') && !next.historyError) {
        setPrompt('')
        onClearAttachment()
      }
      if (operation === 'send' && next.turns.length > chat.turns.length) {
        setPrompt('')
        onClearAttachment()
      }
    } catch {
      setNotice(operation === 'send' && attachment ? 'Could not send the attachment. Check the project’s folder access and file, then try again.' :
        'The desktop chat request failed. You can try again.')
    } finally {
      setPending(undefined)
    }
  }

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try { setMatches(await bridge.searchChats(query, showArchived)) }
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

  function changeChat(action: ChatChange) {
    void run('change', () => bridge.changeChat(action))
  }

  function mayLeaveTemporary() {
    return !chat.temporary || !(chat.turns.length || prompt.trim()) ||
      window.confirm('Leave this temporary chat? Its messages and draft will be lost.')
  }

  function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (selected && prompt.trim() && attachmentMatches) void run('send', () => bridge.sendChat(selected, prompt, attachment))
  }

  return (
    <section className="mt-8 rounded-xl border p-6" aria-labelledby="chat-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="chat-heading" className="text-2xl font-semibold">Chat workspace</h2>
        <div className="flex flex-wrap gap-3">
          <button type="button" disabled={busy || (!chat.turns.length && !chat.temporary)} onClick={() => {
            if (!mayLeaveTemporary()) return
            setPrompt('')
            void run('clear', bridge.clearChat)
          }}>New chat</button>
          <button type="button" disabled={busy || !!chat.temporary} onClick={() => {
            setPrompt('')
            changeChat({ action: 'temporary' })
          }}>New temporary chat</button>
        </div>
      </div>
      {chat.temporary && <p className="mt-3 muted">Temporary chat. DeskAgent keeps these messages in memory until you leave the chat or quit.</p>}
      {!!(chat.saved?.length || chat.archived?.length) && (
        <div className="mt-4 flex gap-3">
          <button type="button" aria-pressed={!showArchived} disabled={busy}
            onClick={() => { setShowArchived(false); setMatches(undefined) }}>Recent chats</button>
          <button type="button" aria-pressed={showArchived} disabled={busy}
            onClick={() => { setShowArchived(true); setMatches(undefined) }}>Archived chats</button>
        </div>
      )}
      {!!(showArchived ? chat.archived?.length : chat.saved?.length) && (
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
      {!!visibleChats.length && (
        <label className="mt-4 grid gap-2">
          {showArchived ? 'Archived conversation' : 'Saved conversation'}
          <select className="rounded border bg-transparent p-2"
            value={visibleChats.some(({ id }) => id === chat.conversation) ? chat.conversation : ''} disabled={busy}
            onChange={(event) => {
              const id = event.target.value
              if (!mayLeaveTemporary()) return
              if (chat.temporary) setPrompt('')
              void run('open', () => bridge.openChat(id))
            }}>
            <option value="" disabled>Choose a saved chat</option>
            {visibleChats.map(({ id, title }) => <option key={id} value={id}>{title}</option>)}
          </select>
        </label>
      )}
      {showArchived && !matches && !chat.archived?.length && <p className="mt-3 muted">No archived chats.</p>}
      {chat.conversation && chat.activeChat && (
        <div className="mt-4">
          <p className="font-semibold">{chat.activeChat.title}</p>
          {rename !== undefined ? (
            <form className="mt-3 flex flex-wrap items-end gap-3" onSubmit={(event) => {
              event.preventDefault()
              if (chat.conversation && rename.trim()) changeChat({ action: 'rename', id: chat.conversation, title: rename })
            }}>
              <label className="grid gap-2">Conversation title
                <input maxLength={160} value={rename} className="rounded border bg-transparent p-2"
                  onChange={(event) => setRename(event.target.value)} />
              </label>
              <button type="submit" disabled={busy || !rename.trim()}>Save title</button>
              <button type="button" onClick={() => setRename(undefined)}>Cancel</button>
            </form>
          ) : <div className="mt-3 flex flex-wrap gap-3">
            <button type="button" disabled={busy} onClick={() => setRename(chat.activeChat?.title)}>Rename</button>
            <button type="button" disabled={busy} onClick={() => {
              if (chat.conversation) changeChat({ action: chat.activeChat?.archived ? 'restore' : 'archive', id: chat.conversation })
            }}>{chat.activeChat.archived ? 'Restore' : 'Archive'}</button>
            <button type="button" disabled={busy} onClick={() => {
              if (chat.conversation && window.confirm('Delete this saved conversation and its messages?')) {
                changeChat({ action: 'delete', id: chat.conversation })
              }
            }}>Delete</button>
          </div>}
          {chat.activeChat.archived && <p className="mt-3 muted">Restore this conversation to send a message.</p>}
        </div>
      )}
      {chat.conversation && <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" disabled={busy || exporting} onClick={() => { void exportConversation('md') }}>Export Markdown</button>
        <button type="button" disabled={busy || exporting} onClick={() => { void exportConversation('json') }}>Export JSON</button>
      </div>}
      {chat.canLinkProject && (projects.length > 0 || chat.projectId) && (
        <label className="mt-4 grid gap-2">
          Project
          <select className="rounded border bg-transparent p-2" disabled={busy} value={chat.projectId ?? ''}
            onChange={(event) => changeChat({
              action: 'project', id: chat.conversation ?? null, projectId: event.target.value || null,
            })}>
            <option value="">No project</option>
            {chat.projectId && !projects.some(({ id }) => id === chat.projectId) &&
              <option value={chat.projectId}>Unavailable project</option>}
            {projects.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
          </select>
          <span className="muted">Sending a message includes the selected project’s instructions.</span>
        </label>
      )}
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
        {attachment && <div className="grid gap-2 rounded border p-3">
          <p className="break-all">Attachment: {attachment.parts.join('/')}</p>
          <p className="muted">{attachmentMatches ? 'The file text goes to OpenAI with this message.' :
            'Select the same project in this chat, or remove the attachment.'}</p>
          <button type="button" className="justify-self-start" disabled={busy} onClick={onClearAttachment}>Remove attachment</button>
        </div>}
        <label htmlFor="chat-prompt">Message</label>
        <textarea id="chat-prompt" rows={4} className="w-full rounded border bg-transparent p-3"
          disabled={busy || chat.activeChat?.archived || !selected} value={prompt} maxLength={maxPromptLength}
          onChange={(event) => setPrompt(event.target.value)} />
        <div className="flex gap-3">
          <button type="submit" disabled={busy || chat.activeChat?.archived || !selected || !prompt.trim() || !attachmentMatches}>Send</button>
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

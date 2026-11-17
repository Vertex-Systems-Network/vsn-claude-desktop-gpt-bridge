import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Project, ProjectAttachment } from '../../shared/project'
import type { DesktopBridge, RuntimeInfo } from '../../shared/desktop'
import './styles.css'
import { AccountPanel } from './AccountPanel'
import { ProjectsPanel } from './ProjectsPanel'
import { ChatPanel } from './ChatPanel'

declare global {
  interface Window { deskAgent: DesktopBridge }
}

type Theme = 'dark' | 'light'
interface Appearance {
  theme: Theme
  setTheme(theme: Theme): void
}

const useAppearance = create<Appearance>()(persist(
  (set) => ({ theme: 'dark', setTheme: (theme) => set({ theme }) }),
  { name: 'deskagent-appearance' },
))
type Diagnostics = { status: 'loading' | 'error' } | { status: 'ready'; info: RuntimeInfo }

function Workspace() {
  const { theme, setTheme } = useAppearance()
  const [diagnostics, setDiagnostics] = useState<Diagnostics>({ status: 'loading' })
  const [chatSession, setChatSession] = useState(0)
  const [attachment, setAttachment] = useState<ProjectAttachment>()
  const [projects, setProjects] = useState<Project[]>([])
  const [chatBusy, setChatBusy] = useState(false)
  const [requestId, setRequestId] = useState(0)
  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])
  useEffect(() => {
    let active = true
    void window.deskAgent.getRuntimeInfo().then(
      (info) => { if (active) setDiagnostics({ status: 'ready', info }) },
      () => { if (active) setDiagnostics({ status: 'error' }) },
    )
    return () => { active = false }
  }, [requestId])

  return (
    <>
      <header className="flex items-center justify-between gap-4 border-b px-7 py-5">
        <strong>DeskAgent</strong>
        <button type="button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
          Switch to {theme === 'dark' ? 'light' : 'dark'} theme
        </button>
      </header>
      <main className="mx-auto max-w-3xl px-7 py-14">
        <AccountPanel chatBusy={chatBusy} onDisconnect={() => { setAttachment(undefined); setChatSession((id) => id + 1) }} />
        <ChatPanel key={chatSession} onBusy={setChatBusy} projects={projects} attachment={attachment} onClearAttachment={() => setAttachment(undefined)} />
        <ProjectsPanel onProjects={setProjects} onAttach={(file) => { if (!chatBusy) setAttachment(file) }} />
        <h2 className="mt-12 text-xl font-semibold">Desktop diagnostics</h2>
        <p className="mt-3 muted">Check the connection between the desktop window and its local runtime.</p>
        <section className="mt-8 rounded-xl border p-6" aria-label="Runtime status" aria-live="polite">
          {diagnostics.status === 'loading' && <p>Checking runtime…</p>}
          {diagnostics.status === 'error' && (
            <>
              <p role="alert">The desktop runtime could not be reached.</p>
              <button type="button" className="mt-4" onClick={() => {
                setDiagnostics({ status: 'loading' })
                setRequestId((id) => id + 1)
              }}>Retry</button>
            </>
          )}
          {diagnostics.status === 'ready' && (
            <dl className="grid grid-cols-2 gap-3">
              <dt>Application</dt><dd>{diagnostics.info.appVersion}</dd>
              <dt>Electron</dt><dd>{diagnostics.info.electronVersion}</dd>
              <dt>Platform</dt><dd>{diagnostics.info.platform}</dd>
            </dl>
          )}
        </section>
      </main>
    </>
  )
}
createRoot(document.getElementById('root')!).render(<Workspace />)

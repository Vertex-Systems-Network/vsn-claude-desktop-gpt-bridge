import { useState } from 'react'
import type { Project, ProjectAttachment, ProjectGitStatus, ProjectListing } from '../../shared/project'

export function ProjectFiles({ project, onAttach }: { project: Project; onAttach: (attachment: ProjectAttachment) => void }) {
  const bridge = window.deskAgent
  const [path, setPath] = useState<string[]>([])
  const [listing, setListing] = useState<ProjectListing>()
  const [preview, setPreview] = useState<{ name: string; text: string }>()
  const [git, setGit] = useState<ProjectGitStatus>()
  const [gitError, setGitError] = useState('')
  const [busy, setBusy] = useState(false)
  const [attachmentStatus, setAttachmentStatus] = useState('')
  const [error, setError] = useState('')

  async function run(operation: () => Promise<void>) {
    setBusy(true)
    setError('')
    try { await operation() }
    catch { setError('DeskAgent could not open this item. Check folder access and try again.') }
    finally { setBusy(false) }
  }

  async function browse(parts: string[]) {
    setPreview(undefined)
    const result = await bridge.listProjectFiles(project.id, parts)
    setPath(parts)
    setListing(result)
  }

  async function checkGit() {
    setGitError('')
    setGit(undefined)
    try {
      const status = await bridge.getProjectGitStatus(project.id)
      if (status) setGit(status)
    } catch {
      setGitError('Git status is unavailable. Check that the selected folder is a Git repository root and the selected git.exe is installed.')
    }
  }

  return (
    <section className="mt-4 grid gap-3" aria-label="Project files">
      {!listing ? <button type="button" disabled={busy} onClick={() => {
        void run(async () => {
          if (await bridge.grantProjectFiles(project.id)) await browse([])
        })
      }}>Allow read-only folder access</button> : <>
        <p className="break-all">{path.join(' / ') || 'Project folder'}</p>
        <div className="flex flex-wrap gap-3">
          <button type="button" disabled={busy || !path.length}
            onClick={() => { void run(() => browse(path.slice(0, -1))) }}>Parent folder</button>
          <button type="button" disabled={busy} onClick={() => { void run(() => browse(path)) }}>Refresh</button>
          <button type="button" disabled={busy} onClick={() => { void run(checkGit) }}>Git status</button>
          <button type="button" disabled={busy} onClick={() => {
            void run(async () => {
              await bridge.revokeProjectFiles(project.id)
              setListing(undefined)
              setPreview(undefined)
              setGit(undefined)
              setGitError('')
            })
          }}>Revoke access</button>
        </div>
        {gitError && <p role="alert">{gitError}</p>}
        {git && <section className="grid gap-2 rounded border p-3" aria-label="Git status">
          <strong className="break-all">{git.branch}</strong>
          {git.changes.length ? <ul className="max-h-64 overflow-auto">
            {git.changes.map(({ status, path: file, previousPath }) => <li key={file} className="break-all">
              <code className="whitespace-pre">{status}</code>{' '}{previousPath ? previousPath + ' → ' : ''}{file}
            </li>)}
          </ul> : <p className="muted">Working tree is clean.</p>}
          {git.truncated && <p className="muted">Showing up to 300 changed paths.</p>}
        </section>}
        {listing.truncated && <p className="muted">Showing up to 300 items.</p>}
        {listing.entries.length === 0 && <p className="muted">No browsable items.</p>}
        <ul className="grid gap-2">
          {listing.entries.map(({ name, kind, previewable }) => <li key={name}>
            {kind === 'directory' || previewable ? <button type="button" disabled={busy} className="break-all"
              onClick={() => {
                const parts = [...path, name]
                void run(async () => {
                  if (kind === 'directory') await browse(parts)
                  else {
                    setPreview(undefined)
                    setPreview({ name, text: await bridge.previewProjectFile(project.id, parts) })
                  }
                })
              }}>{kind === 'directory' ? 'Open folder' : 'Preview'} {name}</button> : <span className="break-all">{name}</span>}
          </li>)}
        </ul>
      </>}
      {attachmentStatus && <p role="status">{attachmentStatus}</p>}
      {error && <p role="alert">{error}</p>}
      {preview && <div className="grid gap-2">
        <div className="flex items-center justify-between gap-3">
          <strong className="break-all">{preview.name}</strong>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => {
              onAttach({ projectId: project.id, folder: project.folder, parts: [...path, preview.name] })
              setAttachmentStatus('File selected. Link this project in Chat workspace to send it.')
              document.getElementById('chat-heading')?.scrollIntoView({ block: 'start' })
            }}>Attach to chat</button>
            <button type="button" onClick={() => setPreview(undefined)}>Close preview</button>
          </div>
        </div>
        <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-all rounded border p-3">{preview.text || 'Empty file'}</pre>
      </div>}
    </section>
  )
}

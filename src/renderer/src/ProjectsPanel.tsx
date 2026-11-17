import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { Project, ProjectInput } from '../../shared/project'

const blank: ProjectInput = { name: '', instructions: '', chooseFolder: true }

export function ProjectsPanel() {
  const bridge = window.deskAgent
  const [projects, setProjects] = useState<Project[]>()
  const [draft, setDraft] = useState<ProjectInput>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    void bridge.listProjects().then(
      (items) => { if (active) setProjects(items) },
      () => { if (active) setError('DeskAgent could not open local projects.') },
    )
    return () => { active = false }
  }, [bridge, attempt])

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!draft || busy) return
    setBusy(true)
    setError('')
    try {
      const project = await bridge.saveProject(draft)
      if (!project) return
      setProjects((items) => [...(items ?? []).filter(({ id }) => id !== project.id), project]
        .sort((left, right) => left.name.localeCompare(right.name)))
      setDraft(undefined)
    } catch (failure) {
      setError(failure instanceof Error && failure.message.includes('already uses this name')
        ? 'A project already uses this name.' : 'DeskAgent could not save this project. Check the selected folder and try again.')
    } finally { setBusy(false) }
  }

  async function remove(project: Project) {
    if (busy || !window.confirm('Remove this project from DeskAgent? Files on disk will be kept.')) return
    setBusy(true)
    setError('')
    try {
      await bridge.deleteProject(project.id)
      setProjects((items) => items?.filter(({ id }) => id !== project.id))
    } catch { setError('DeskAgent could not remove this project.') }
    finally { setBusy(false) }
  }

  return (
    <section className="mt-8 rounded-xl border p-6" aria-labelledby="projects-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="projects-heading" className="text-2xl font-semibold">Projects</h2>
        <button type="button" disabled={busy || !projects || !!draft} onClick={() => {
          setError('')
          setDraft(blank)
        }}>New project</button>
      </div>
      {!projects && !error && <p className="mt-3 muted">Loading local projects…</p>}
      {projects?.length === 0 && !draft && <p className="mt-3 muted">Add a project to save its folder and instructions.</p>}
      {error && <p className="mt-3" role="alert">{error}</p>}
      {!projects && error && <button type="button" className="mt-3" onClick={() => {
        setError('')
        setAttempt((value) => value + 1)
      }}>Retry</button>}
      {draft && <form className="mt-4 grid gap-3 rounded border p-4" onSubmit={save}>
        <label className="grid gap-2">Name
          <input className="rounded border bg-transparent p-2" value={draft.name} maxLength={120} required disabled={busy}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
        </label>
        <label className="grid gap-2">Project instructions
          <textarea className="rounded border bg-transparent p-2" value={draft.instructions} maxLength={12_000}
            rows={4} disabled={busy} onChange={(event) => setDraft({ ...draft, instructions: event.target.value })} />
        </label>
        {draft.id && <label className="flex items-center gap-2">
          <input type="checkbox" checked={draft.chooseFolder} disabled={busy}
            onChange={(event) => setDraft({ ...draft, chooseFolder: event.target.checked })} /> Choose a different folder
        </label>}
        <div className="flex gap-3">
          <button type="submit" disabled={busy || !draft.name.trim()}>{draft.chooseFolder ? 'Choose folder and save' : 'Save project'}</button>
          <button type="button" disabled={busy} onClick={() => setDraft(undefined)}>Cancel</button>
        </div>
      </form>}
      {!!projects?.length && <ul className="mt-4 grid gap-3">
        {projects.map((project) => <li key={project.id} className="rounded border p-4">
          <h3 className="font-semibold break-words">{project.name}</h3>
          <p className="mt-1 break-all muted">{project.folder}</p>
          <div className="mt-3 flex gap-3">
            <button type="button" disabled={busy || !!draft} onClick={() => {
              setError('')
              setDraft({ id: project.id, name: project.name, instructions: project.instructions, chooseFolder: false })
            }}>Edit</button>
            <button type="button" disabled={busy || !!draft} onClick={() => { void remove(project) }}>Remove</button>
          </div>
        </li>)}
      </ul>}
    </section>
  )
}

import { expect, it, vi } from 'vitest'
import { ChatService } from '../src/main/inference/chat'
import { ChatHistory } from '../src/main/storage/history'

it('persists the project link and applies current instructions only to the linked chat', async () => {
  const history = new ChatHistory(':memory:')
  let instructions = 'Follow the project style.'
  const project = (id: string) => id === 'project-1' ? { id, name: 'Example', folder: 'local', instructions } : undefined
  const response = () => new Response(
    'data: {"type":"response.output_text.delta","delta":"reply"}\n\ndata: {"type":"response.completed"}\n\n',
    { headers: { 'content-type': 'text/event-stream' } },
  )
  const fetcher = vi.fn().mockImplementation((url: string) => Promise.resolve(url.endsWith('/models')
    ? Response.json({ models: [{ slug: 'model', display_name: 'Model', visibility: 'list' }] }) : response()))
  vi.stubGlobal('fetch', fetcher)
  try {
    const create = () => new ChatService(async () => 'fixture-token', history, () => 'account', project)
    const chat = create()
    await chat.loadModels()
    expect(chat.change({ action: 'project', id: null, projectId: 'project-1' }).projectId).toBe('project-1')
    const sent = await chat.send('model', 'first prompt')
    expect(sent.turns[0]?.phase).toBe('complete')
    expect(JSON.parse(fetcher.mock.calls[1][1].body).instructions).toBe(instructions)
    expect(sent.conversation).toBeDefined()
    if (!sent.conversation) throw new Error('Expected a saved conversation')
    expect(history.project('other account', sent.conversation)).toBeUndefined()
    expect(history.linkProject('other account', sent.conversation, null)).toBe(false)
    const reopened = create()
    await reopened.loadModels()
    expect(reopened.snapshot().projectId).toBe('project-1')
    instructions = 'Use the updated style.'
    await reopened.send('model', 'next prompt')
    expect(JSON.parse(fetcher.mock.calls[3][1].body).instructions).toBe(instructions)
    reopened.change({ action: 'project', id: sent.conversation, projectId: null })
    await reopened.send('model', 'unlinked prompt')
    expect(JSON.parse(fetcher.mock.calls[4][1].body)).not.toHaveProperty('instructions')
  } finally {
    vi.unstubAllGlobals()
    history.close()
  }
})

import { expect, it, vi } from 'vitest'
import { ChatService } from '../src/main/inference/chat'
import { ChatHistory } from '../src/main/storage/history'

it('streams a temporary reply without adding a SQLite conversation or exposing export', async () => {
  const history = new ChatHistory(':memory:')
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce(Response.json({ models: [{ slug: 'model', display_name: 'Model', visibility: 'list' }] }))
    .mockResolvedValueOnce(new Response(
      'data: {"type":"response.output_text.delta","delta":"reply"}\n\ndata: {"type":"response.completed"}\n\n',
      { headers: { 'content-type': 'text/event-stream' } },
    )))
  try {
    const chat = new ChatService(async () => 'fixture-token', history, () => 'account')
    await chat.loadModels()
    expect(chat.change({ action: 'temporary' }).temporary).toBe(true)
    expect((await chat.send('model', 'private prompt')).turns[0]?.phase).toBe('complete')
    expect(history.list('account')).toEqual([])
    expect(chat.exportConversation()).toBeUndefined()
    expect(chat.clear()).toMatchObject({ temporary: false, turns: [] })
  } finally {
    vi.unstubAllGlobals()
    history.close()
  }
})

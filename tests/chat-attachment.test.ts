import { expect, it, vi } from 'vitest'
import { ChatHistory } from '../src/main/storage/history'
import { ChatService } from '../src/main/inference/chat'

it('includes the attachment only in the explicitly submitted request and omits it from history', async () => {
  const history = new ChatHistory(':memory:')
  const fetcher = vi.fn().mockImplementation((url: string) => Promise.resolve(url.endsWith('/models')
    ? Response.json({ models: [{ slug: 'model', display_name: 'Model', visibility: 'list' }] })
    : new Response('data: {"type":"response.output_text.delta","delta":"reply"}\n\ndata: {"type":"response.completed"}\n\n',
      { headers: { 'content-type': 'text/event-stream' } })))
  vi.stubGlobal('fetch', fetcher)
  try {
    const chat = new ChatService(async () => 'fixture-token', history, () => 'account')
    await chat.loadModels()
    const sent = await chat.send('model', 'Summarize this.', { name: 'notes.md', text: 'Unique file text' })
    expect(JSON.parse(fetcher.mock.calls[1][1].body).input[0].content).toContain('Unique file text')
    expect(sent.turns[0]?.prompt).toBe('Summarize this.')
    expect(history.read('account', sent.conversation ?? '')?.[0]?.prompt).toBe('Summarize this.')
    await chat.send('model', 'Next message')
    expect(fetcher.mock.calls[2][1].body).not.toContain('Unique file text')
    const oversized = await chat.send('model', 'Too large', { name: 'large.txt', text: 'a'.repeat(8_001) })
    expect(oversized.error).toMatch(/8,000/)
    expect(fetcher).toHaveBeenCalledTimes(3)
  } finally {
    vi.unstubAllGlobals()
    history.close()
  }
})

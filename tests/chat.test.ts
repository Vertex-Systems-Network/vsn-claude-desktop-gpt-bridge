import { afterEach, describe, expect, it, vi } from 'vitest'
import { assembleContext, ChatService } from '../src/main/inference/chat'

const model = { slug: 'test-model', display_name: 'Test model', visibility: 'list' }
const requested = () => Response.json({ models: [model] })
afterEach(() => vi.unstubAllGlobals())

describe('chat workspace', () => {
  it('includes complete turns in order and excludes interrupted output', () => {
    expect(assembleContext([
      { prompt: 'first', reply: 'done', phase: 'complete' },
      { prompt: 'second', reply: 'partial', phase: 'stopped' },
      { prompt: 'third', reply: 'done again', phase: 'complete' },
    ], 'next')).toEqual([
      { role: 'user', content: 'first' },
      { role: 'assistant', content: 'done' },
      { role: 'user', content: 'third' },
      { role: 'assistant', content: 'done again' },
      { role: 'user', content: 'next' },
    ])
  })

  it('keeps complete recent turns within the request size limit', () => {
    expect(assembleContext([
      { prompt: 'too long', reply: 'a'.repeat(32_000), phase: 'complete' },
      { prompt: 'short', reply: 'done', phase: 'complete' },
    ], 'next').map(({ content }) => content)).toEqual(['short', 'done', 'next'])
  })

  it('rejects undiscovered models before making network requests', async () => {
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    const chat = new ChatService(async () => 'fixture-token')
    expect((await chat.send('unknown', 'hello')).error).toMatch(/available model/)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('shows real stream deltas and keeps an interrupted reply out of later requests', async () => {
    const encoder = new TextEncoder()
    const fetcher = vi.fn().mockResolvedValueOnce(requested()).mockImplementationOnce(
      (_url: string, options: RequestInit) => new Response(new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"type":"response.output_text.delta","delta":"partial"}\n\n'))
          options.signal?.addEventListener('abort', () => controller.error(options.signal?.reason), { once: true })
        },
      }), { headers: { 'content-type': 'text/event-stream' } }),
    ).mockResolvedValueOnce(new Response(
      'data: {"type":"response.output_text.delta","delta":"done"}\n\ndata: {"type":"response.completed"}\n\n',
      { headers: { 'content-type': 'text/event-stream' } },
    ))
    vi.stubGlobal('fetch', fetcher)
    const chat = new ChatService(async () => 'fixture-token')
    await chat.loadModels()
    const pending = chat.send(model.slug, 'first')
    await vi.waitFor(() => expect(chat.snapshot().turns[0]).toMatchObject({ phase: 'streaming', reply: 'partial' }))
    chat.stop()
    expect((await pending).turns[0]).toMatchObject({ phase: 'stopped', reply: 'partial' })
    expect((await chat.send(model.slug, 'next')).turns[1]).toMatchObject({ phase: 'complete', reply: 'done' })
    expect(JSON.parse(fetcher.mock.calls[2][1].body).input).toEqual([{ role: 'user', content: 'next' }])
  })
})

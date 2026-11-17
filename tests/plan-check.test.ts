import { afterEach, describe, expect, it, vi } from 'vitest'
import { checkPlan, listVisibleModels, readCompletedText } from '../src/main/inference/plan-check'

const model = { slug: 'fixture-model', display_name: 'Fixture model', visibility: 'list' }
const delta = 'data: {"type":"response.output_text.delta","delta":"Ready"}\r\n\r\n'
const completed = 'data: {"type":"response.completed","response":{"error":null}}\r\n\r\n'
const stream = (parts: string[]) => new ReadableStream<Uint8Array>({
  start(controller) {
    for (const part of parts) controller.enqueue(new TextEncoder().encode(part))
    controller.close()
  },
})

afterEach(() => vi.unstubAllGlobals())

describe('subscription plan check', () => {
  it('returns only displayable models in catalog order', () => {
    const hidden = { ...model, visibility: 'hidden' }
    expect(listVisibleModels({ models: [hidden, model, { ...model, slug: 'later' }] }).map(({ slug }) => slug))
      .toEqual(['fixture-model', 'later'])
  })

  it('requires a completed event and handles CRLF frames split across chunks', async () => {
    await expect(readCompletedText(stream([delta.slice(0, -1), delta.slice(-1) + completed])))
      .resolves.toBe('Ready')
    await expect(readCompletedText(stream([delta, 'data: [DONE]\n\n'])))
      .rejects.toMatchObject({ code: 'INFERENCE_STREAM_INTERRUPTED' })
  })

  it('preserves a usage-limit error received inside the stream', async () => {
    const failed = 'data: {"type":"response.failed","response":{"error":{"code":"subscription_sharing_usage_limit_exceeded"}}}\n\n'
    await expect(readCompletedText(stream([delta, failed])))
      .rejects.toMatchObject({ code: 'subscription_sharing_usage_limit_exceeded' })
  })

  it('requests visible models then streams the supported OAuth Responses body', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json({ models: [model] }))
      .mockResolvedValueOnce(new Response(stream([delta, completed]), { headers: { 'Content-Type': 'text/event-stream' } }))
    vi.stubGlobal('fetch', fetcher)
    await expect(checkPlan('test-token')).resolves.toEqual(model)
    expect(fetcher.mock.calls[0][0]).toBe('https://api.openai.com/v1/models')
    const [url, options] = fetcher.mock.calls[1]
    expect(url).toBe('https://api.openai.com/v1/responses')
    expect(options.headers.Authorization).toBe('Bearer test-token')
    expect(JSON.parse(options.body)).toEqual({
      model: 'fixture-model', store: false, stream: true,
      input: [{ role: 'user', content: 'Reply with one word: Ready.' }],
    })
  })

  it('preserves HTTP status and request ID without making a second call', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(
      { error: { code: 'subscription_sharing_user_not_eligible' } },
      { status: 403, headers: { 'x-request-id': 'req_fixture' } },
    ))
    vi.stubGlobal('fetch', fetcher)
    await expect(checkPlan('test-token')).rejects.toMatchObject({
      code: 'subscription_sharing_user_not_eligible', httpStatus: 403, requestId: 'req_fixture',
    })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})

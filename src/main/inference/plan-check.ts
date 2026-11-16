import { z } from 'zod'

const api = 'https://api.openai.com/v1'
const catalog = z.object({
  models: z.array(z.object({
    slug: z.string().min(1),
    display_name: z.string().min(1),
    visibility: z.string(),
  })),
})
const errorCode = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/)
const errorBody = z.object({ error: z.object({ code: errorCode }) })
const streamEvent = z.object({
  type: z.string(), delta: z.string().optional(), response: z.object({ error: errorBody.shape.error.nullish() }).optional(), code: errorCode.nullish(),
})

export class PlanCheckError extends Error {
  constructor(readonly code: string, readonly httpStatus?: number, readonly requestId?: string) {
    super(code)
  }
}

export function listVisibleModels(value: unknown) {
  return catalog.parse(value).models.filter((model) => model.visibility === 'list')
}

export async function readCompletedText(body: ReadableStream<Uint8Array>): Promise<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffered = ''
  let text = ''
  let bytes = 0
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) throw new PlanCheckError('INFERENCE_STREAM_INTERRUPTED')
      bytes += value.byteLength
      if (bytes > 1_048_576) throw new PlanCheckError('INFERENCE_INVALID_RESPONSE')
      buffered += decoder.decode(value, { stream: true })
      let boundary = /\r?\n\r?\n/.exec(buffered)
      while (boundary) {
        const frame = buffered.slice(0, boundary.index)
        buffered = buffered.slice(boundary.index + boundary[0].length)
        boundary = /\r?\n\r?\n/.exec(buffered)
        const data = frame.split(/\r?\n/).filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).replace(/^ /, '')).join('\n')
        if (!data || data === '[DONE]') continue
        const event = streamEvent.parse(JSON.parse(data))
        if (event.type === 'response.output_text.delta') text += event.delta ?? ''
        if (event.type === 'response.completed') {
          if (!text.trim()) throw new PlanCheckError('INFERENCE_EMPTY_RESPONSE')
          return text
        }
        if (event.type === 'response.failed' || event.type === 'error' || event.type === 'response.incomplete') {
          throw new PlanCheckError(event.response?.error?.code ?? event.code ?? 'INFERENCE_FAILED')
        }
      }
    }
  } finally {
    void reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}

async function ensureSuccess(response: Response): Promise<void> {
  if (response.ok) return
  const body: unknown = await response.json().catch(() => null)
  const parsed = errorBody.safeParse(body)
  const id = errorCode.safeParse(response.headers.get('x-request-id') ?? response.headers.get('openai-request-id'))
  throw new PlanCheckError(parsed.success ? parsed.data.error.code : 'INFERENCE_HTTP_ERROR',
    response.status, id.success ? id.data : undefined)
}

export async function checkPlan(accessToken: string) {
  const headers = { Authorization: 'Bearer ' + accessToken }
  const catalogResponse = await fetch(api + '/models', {
    headers, redirect: 'error', signal: AbortSignal.timeout(15_000),
  })
  await ensureSuccess(catalogResponse)
  const [model] = listVisibleModels(await catalogResponse.json())
  if (!model) throw new PlanCheckError('MODEL_UNAVAILABLE')

  const response = await fetch(api + '/responses', {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
    redirect: 'error', signal: AbortSignal.timeout(45_000),
    body: JSON.stringify({
      model: model.slug, store: false, stream: true,
      input: [{ role: 'user', content: 'Reply with one word: Ready.' }],
    }),
  })
  await ensureSuccess(response)
  if (!response.body || !response.headers.get('content-type')?.startsWith('text/event-stream')) {
    throw new PlanCheckError('INFERENCE_INVALID_RESPONSE')
  }
  await readCompletedText(response.body)
  return model
}

import type { ChatMessage, ChatSnapshot, ChatTurn } from '../../shared/chat'
import { fetchModels, PlanCheckError, streamText } from './plan-check'

export function assembleContext(turns: ChatTurn[], prompt: string): ChatMessage[] {
  const history: ChatMessage[] = []
  let remaining = 32_000 - prompt.length
  for (let index = turns.length - 1; index >= 0; index--) {
    const turn = turns[index]
    if (turn.phase !== 'complete') continue
    const length = turn.prompt.length + turn.reply.length
    if (length > remaining) break
    remaining -= length
    history.unshift({ role: 'user', content: turn.prompt }, { role: 'assistant', content: turn.reply })
  }
  return [...history, { role: 'user', content: prompt }]
}

function describeError(error: unknown): string {
  if (!(error instanceof PlanCheckError)) return 'The request could not reach OpenAI or timed out.'
  const diagnostic = error.requestId ? error.code + ' · ' + error.requestId : error.code
  if (error.httpStatus === 401 || error.code === 'CHAT_AUTH_REQUIRED') {
    return 'Connect an eligible ChatGPT account or renew your session. (' + diagnostic + ')'
  }
  if (error.code === 'subscription_sharing_usage_limit_exceeded' || error.httpStatus === 429) {
    return 'The usage limit was reached. Check ChatGPT settings before trying again. (' + diagnostic + ')'
  }
  if (error.code === 'subscription_sharing_user_not_eligible') {
    return 'The signed-in account or workspace is ineligible for plan usage. (' + diagnostic + ')'
  }
  return 'OpenAI could not complete the request. (' + diagnostic + ')'
}

export class ChatService {
  private models: ChatSnapshot['models'] = []
  private turns: ChatTurn[] = []
  private running = false
  private request?: AbortController
  private error?: string

  constructor(private readonly getAccess: () => Promise<string>) {}

  get busy() { return this.running }

  snapshot(): ChatSnapshot {
    return { models: this.models, turns: this.turns.map((turn) => ({ ...turn })), busy: this.busy, error: this.error }
  }

  async loadModels(): Promise<ChatSnapshot> {
    if (this.running) return this.snapshot()
    this.error = undefined
    this.running = true
    try {
      const token = await this.getAccess()
      this.models = (await fetchModels(token)).map(({ slug, display_name }) => ({ slug, display_name }))
      if (!this.models.length) this.error = 'OpenAI returned no selectable models for this account.'
    } catch (error) {
      this.models = []
      this.error = describeError(error)
    } finally {
      this.running = false
    }
    return this.snapshot()
  }

  async send(model: string, prompt: string): Promise<ChatSnapshot> {
    if (this.running) return this.snapshot()
    this.error = undefined
    if (!this.models.some(({ slug }) => slug === model) || this.turns.length >= 60) {
      this.error = this.turns.length >= 60 ? 'Start a new chat to send more messages.' : 'Reload models and choose an available model.'
      return this.snapshot()
    }
    const input = assembleContext(this.turns, prompt)
    const turn: ChatTurn = { prompt, reply: '', phase: 'streaming' }
    this.turns.push(turn)
    const request = new AbortController()
    this.request = request
    this.running = true
    try {
      const token = await this.getAccess()
      request.signal.throwIfAborted()
      turn.reply = await streamText(token, model, input, (delta) => {
        if (!request.signal.aborted) turn.reply += delta
      }, request.signal)
      turn.phase = 'complete'
    } catch (error) {
      turn.phase = request.signal.aborted ? 'stopped' : 'failed'
      if (!request.signal.aborted) this.error = describeError(error)
    } finally {
      this.request = undefined
      this.running = false
    }
    return this.snapshot()
  }

  stop(): void { this.request?.abort() }

  clear(clearModels = false): ChatSnapshot {
    if (!this.running) {
      this.turns = []
      this.error = undefined
      if (clearModels) this.models = []
    }
    return this.snapshot()
  }
}

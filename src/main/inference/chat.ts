import type { ChatMessage, ChatSnapshot, ChatTurn, SavedChat } from '../../shared/chat'
import type { ChatHistory } from '../storage/history'
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

  private scope?: string
  private conversation?: string
  private saved: ChatSnapshot['saved'] = []
  private historyError?: string

  constructor(
    private readonly getAccess: () => Promise<string>,
    private readonly history?: ChatHistory,
    private readonly getScope: () => string | undefined = () => undefined,
  ) {}

  private syncHistory(): void {
    const scope = this.getScope()
    if (this.running || this.scope === scope) return
    this.scope = scope
    this.models = []
    this.turns = []
    this.saved = []
    this.conversation = undefined
    this.error = undefined
    this.historyError = undefined
    if (!scope) return
    try {
      if (!this.history) throw new Error('Chat history unavailable')
      this.saved = this.history.list(scope)
      const latest = this.saved[0]
      if (latest) {
        this.turns = this.history.read(scope, latest.id) ?? []
        this.conversation = latest.id
      }
    } catch {
      this.historyError = 'Local chat history could not be opened. Check storage and restart DeskAgent.'
    }
  }

  find(query: string): SavedChat[] {
    this.syncHistory()
    if (!this.scope || !this.history || this.running) return []
    return this.history.search(this.scope, query)
  }

  exportConversation(): { title: string; turns: ChatTurn[] } | undefined {
    this.syncHistory()
    if (!this.scope || !this.history || !this.conversation || this.running) return
    const title = this.saved?.find(({ id }) => id === this.conversation)?.title ?? 'DeskAgent chat'
    return { title, turns: this.turns.map((turn) => ({ ...turn })) }
  }

  open(id: string): ChatSnapshot {
    this.syncHistory()
    if (this.running || !this.scope || !this.history) return this.snapshot()
    try {
      const turns = this.history.read(this.scope, id)
      if (!turns) {
        this.historyError = 'This conversation is unavailable.'
        return this.snapshot()
      }
      this.turns = turns
      this.conversation = id
      this.error = undefined
      this.historyError = undefined
    } catch {
      this.historyError = 'DeskAgent could not open this saved chat.'
    }
    return this.snapshot()
  }

  get busy() { return this.running }

  snapshot(): ChatSnapshot {
    this.syncHistory()
    return { saved: this.saved, conversation: this.conversation, historyError: this.historyError, models: this.models, turns: this.turns.map((turn) => ({ ...turn })), busy: this.busy, error: this.error }
  }

  async loadModels(): Promise<ChatSnapshot> {
    this.syncHistory()
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
    this.syncHistory()
    if (this.running) return this.snapshot()
    this.error = undefined
    if (!this.models.some(({ slug }) => slug === model) || this.turns.length >= 60) {
      this.error = this.turns.length >= 60 ? 'Start a new chat to send more messages.' : 'Reload models and choose an available model.'
      return this.snapshot()
    }
    const input = assembleContext(this.turns, prompt)
    const turn: ChatTurn = { prompt, reply: '', phase: 'streaming' }
    const account = this.scope
    const position = this.turns.length
    if (account) {
      try {
        if (!this.history) throw new Error('Chat history unavailable')
        this.conversation = this.history.append(account, this.conversation, position, model, prompt)
      } catch {
        this.historyError = 'The message could not be saved locally. DeskAgent did not send it.'
        return this.snapshot()
      }
    }
    this.historyError = undefined
    if (account && this.history) {
      try { this.saved = this.history.list(account) } catch { this.historyError = 'DeskAgent could not update the history list.' }
    }
    this.turns.push(turn)
    const request = new AbortController()
    this.request = request
    this.running = true
    const conversation = this.conversation
    let checkpoint = Date.now()
    const saveTurn = () => {
      if (account && conversation) this.history?.update(account, conversation, position, turn)
    }
    try {
      const token = await this.getAccess()
      request.signal.throwIfAborted()
      turn.reply = await streamText(token, model, input, (delta) => {
        if (request.signal.aborted) return
        turn.reply += delta
        if (Date.now() - checkpoint >= 1_000) {
          checkpoint = Date.now()
          try { saveTurn() } catch { this.historyError = 'DeskAgent could not save a streaming checkpoint.' }
        }
      }, request.signal)
      turn.phase = 'complete'
    } catch (error) {
      turn.phase = request.signal.aborted ? 'stopped' : 'failed'
      if (!request.signal.aborted) this.error = describeError(error)
    } finally {
      try { saveTurn() } catch { this.historyError = 'DeskAgent could not save the final reply.' }
      this.request = undefined
      this.running = false
    }
    return this.snapshot()
  }

  stop(): void { this.request?.abort() }

  clear(): ChatSnapshot {
    this.syncHistory()
    if (!this.running) {
      this.turns = []
      this.error = undefined
      this.conversation = undefined
    }
    return this.snapshot()
  }
}

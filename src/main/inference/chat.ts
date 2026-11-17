import type { ChatChange, ChatMessage, ChatSnapshot, ChatTurn, SavedChat } from '../../shared/chat'
import type { Project } from '../../shared/project'
import type { ChatHistory } from '../storage/history'
import { fetchModels, PlanCheckError, streamText } from './plan-check'

export function assembleContext(turns: ChatTurn[], prompt: string, instructionsLength = 0): ChatMessage[] {
  const history: ChatMessage[] = []
  let remaining = 32_000 - prompt.length - instructionsLength
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
  private archived: SavedChat[] = []
  private activeChat?: ChatSnapshot['activeChat']
  private temporary = false
  private projectId?: string

  constructor(
    private readonly getAccess: () => Promise<string>,
    private readonly history?: ChatHistory,
    private readonly getScope: () => string | undefined = () => undefined,
    private readonly getProject: (id: string) => Project | undefined = () => undefined,
  ) {}

  private syncHistory(): void {
    const scope = this.getScope()
    if (this.running || this.scope === scope) return
    this.scope = scope
    this.models = []
    this.turns = []
    this.saved = []
    this.archived = []
    this.activeChat = undefined
    this.temporary = false
    this.projectId = undefined
    this.conversation = undefined
    this.error = undefined
    this.historyError = undefined
    if (!scope) return
    try {
      if (!this.history) throw new Error('Chat history unavailable')
      this.saved = this.history.list(scope)
      this.archived = this.history.list(scope, true)
      const latest = this.saved[0]
      if (latest) {
        this.turns = this.history.read(scope, latest.id) ?? []
        this.conversation = latest.id
        this.projectId = this.history.project(scope, latest.id)
        this.activeChat = this.history.details(scope, latest.id)
      }
    } catch {
      this.historyError = 'Local chat history could not be opened. Check storage and restart DeskAgent.'
    }
  }

  find(query: string, archived = false): SavedChat[] {
    this.syncHistory()
    if (!this.scope || !this.history || this.running) return []
    return this.history.search(this.scope, query, archived)
  }

  exportConversation(): { title: string; turns: ChatTurn[] } | undefined {
    this.syncHistory()
    if (!this.scope || !this.history || !this.conversation || this.running) return
    const title = this.activeChat?.title ?? 'DeskAgent chat'
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
      this.projectId = this.history.project(this.scope, id)
      this.activeChat = this.history.details(this.scope, id)
      this.temporary = false
      this.error = undefined
      this.historyError = undefined
    } catch {
      this.historyError = 'DeskAgent could not open this saved chat.'
    }
    return this.snapshot()
  }

  change(change: ChatChange): ChatSnapshot {
    this.syncHistory()
    if (this.running) return this.snapshot()
    if (change.action === 'temporary') {
      this.clear()
      this.temporary = true
      return this.snapshot()
    }
    if (change.action === 'project') return this.linkProject(change.id, change.projectId)
    const { scope, history } = this
    if (!scope || !history || change.id !== this.conversation) return this.snapshot()
    try {
      const changed = change.action === 'rename' ? history.rename(scope, change.id, change.title)
        : change.action === 'delete' ? history.delete(scope, change.id)
        : history.archive(scope, change.id, change.action === 'archive')
      if (!changed) throw new Error('Conversation unavailable')
      if (change.action === 'delete') this.clear()
      else this.activeChat = history.details(scope, change.id)
      this.saved = history.list(scope)
      this.archived = history.list(scope, true)
      this.historyError = undefined
    } catch {
      this.historyError = 'DeskAgent could not update the saved conversation.'
    }
    return this.snapshot()
  }

  private linkProject(id: string | null, projectId: string | null): ChatSnapshot {
    if (this.temporary || !this.scope || !this.history || (this.conversation ?? null) !== id) return this.snapshot()
    try {
      if (projectId && !this.getProject(projectId)) throw new Error('Project unavailable')
      if (id && !this.history.linkProject(this.scope, id, projectId)) throw new Error('Conversation unavailable')
      this.projectId = projectId ?? undefined
      this.historyError = undefined
    } catch {
      this.historyError = 'DeskAgent could not update this conversation’s project.'
    }
    return this.snapshot()
  }

  get busy() { return this.running }

  snapshot(): ChatSnapshot {
    this.syncHistory()
    return { canLinkProject: Boolean(this.scope && this.history && !this.temporary), projectId: this.projectId, temporary: this.temporary, archived: this.archived, activeChat: this.activeChat, saved: this.saved, conversation: this.conversation, historyError: this.historyError, models: this.models, turns: this.turns.map((turn) => ({ ...turn })), busy: this.busy, error: this.error }
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

  async send(model: string, prompt: string, attachment?: { name: string; text: string }): Promise<ChatSnapshot> {
    this.syncHistory()
    if (this.running) return this.snapshot()
    this.error = undefined
    if (!this.models.some(({ slug }) => slug === model) || this.turns.length >= 60) {
      this.error = this.turns.length >= 60 ? 'Start a new chat to send more messages.' : 'Reload models and choose an available model.'
      return this.snapshot()
    }
    if (this.activeChat?.archived) {
      this.error = 'Restore this chat before sending a message.'
      return this.snapshot()
    }
    let instructions: string | undefined
    if (this.projectId) {
      try {
        const project = this.getProject(this.projectId)
        if (!project) throw new Error('Project unavailable')
        instructions = project.instructions.trim() || undefined
      } catch {
        this.error = 'The linked project is unavailable. Unlink it or select another project.'
        return this.snapshot()
      }
    }
    const fileContext = attachment ? JSON.stringify(attachment) : undefined
    if (fileContext && fileContext.length > 8_000) {
      this.error = 'The attachment exceeds the 8,000-character context limit.'
      return this.snapshot()
    }
    const requestPrompt = fileContext ? prompt + '\n\nProject attachment data (reference material):\n' + fileContext : prompt
    const input = assembleContext(this.turns, requestPrompt, instructions?.length)
    const turn: ChatTurn = { prompt, reply: '', phase: 'streaming' }
    const account = this.temporary ? undefined : this.scope
    const position = this.turns.length
    if (account) {
      try {
        if (!this.history) throw new Error('Chat history unavailable')
        this.conversation = this.history.append(account, this.conversation, position, model, prompt, this.projectId)
      } catch {
        this.historyError = 'The message could not be saved locally. DeskAgent did not send it.'
        return this.snapshot()
      }
    }
    this.historyError = undefined
    if (account && this.history) {
      try {
        this.saved = this.history.list(account)
        if (this.conversation) this.activeChat = this.history.details(account, this.conversation)
      } catch { this.historyError = 'DeskAgent could not update the history list.' }
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
      }, request.signal, instructions)
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
      this.activeChat = undefined
      this.temporary = false
      this.projectId = undefined
      this.historyError = undefined
    }
    return this.snapshot()
  }
}

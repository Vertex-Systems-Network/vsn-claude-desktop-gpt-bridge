export type ChatMessage = { role: 'user' | 'assistant'; content: string }
export type ChatModel = { slug: string; display_name: string }
export type ChatTurn = {
  prompt: string
  reply: string
  phase: 'streaming' | 'complete' | 'stopped' | 'failed'
}
export type SavedChat = { id: string; title: string }
export interface ChatSnapshot {
  models: ChatModel[]
  turns: ChatTurn[]
  busy: boolean
  saved?: SavedChat[]
  conversation?: string
  historyError?: string
  error?: string
}
export const maxPromptLength = 12_000

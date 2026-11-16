export type ChatMessage = { role: 'user' | 'assistant'; content: string }
export type ChatModel = { slug: string; display_name: string }
export type ChatTurn = {
  prompt: string
  reply: string
  phase: 'streaming' | 'complete' | 'stopped' | 'failed'
}
export interface ChatSnapshot {
  models: ChatModel[]
  turns: ChatTurn[]
  busy: boolean
  error?: string
}
export const maxPromptLength = 12_000

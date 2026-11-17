export type ChatMessage = { role: 'user' | 'assistant'; content: string }
export type ChatModel = { slug: string; display_name: string }
export type ChatTurn = {
  prompt: string
  reply: string
  phase: 'streaming' | 'complete' | 'stopped' | 'failed'
}
export type SavedChat = { id: string; title: string }
export type ChatChange =
  | { action: 'temporary' }
  | { action: 'project'; id: string | null; projectId: string | null }
  | { action: 'rename'; id: string; title: string }
  | { action: 'archive' | 'restore' | 'delete'; id: string }

export interface ChatSnapshot {
  models: ChatModel[]
  turns: ChatTurn[]
  busy: boolean
  saved?: SavedChat[]
  archived?: SavedChat[]
  activeChat?: { title: string; archived: boolean }
  temporary?: boolean
  projectId?: string
  canLinkProject?: boolean
  conversation?: string
  historyError?: string
  error?: string
}
export const maxPromptLength = 12_000

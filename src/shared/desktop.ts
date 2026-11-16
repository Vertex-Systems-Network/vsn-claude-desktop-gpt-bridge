import type { ChatSnapshot, SavedChat } from './chat'
import type { AccountStatus } from './account'
import { z } from 'zod'

export const runtimeInfo = z.strictObject({
  appVersion: z.string().min(1),
  electronVersion: z.string().min(1),
  platform: z.string().min(1),
})

export type RuntimeInfo = z.infer<typeof runtimeInfo>

export interface DesktopBridge {
  getAccountStatus(): Promise<AccountStatus>
  signIn(): Promise<AccountStatus>
  enablePlan(): Promise<AccountStatus>
  cancelSignIn(): Promise<AccountStatus>
  verifyPlan(): Promise<AccountStatus>
  refreshAccount(): Promise<AccountStatus>
  signOut(): Promise<AccountStatus>
  getChat(): Promise<ChatSnapshot>
  loadChatModels(): Promise<ChatSnapshot>
  sendChat(model: string, prompt: string): Promise<ChatSnapshot>
  stopChat(): Promise<void>
  searchChats(query: string): Promise<SavedChat[]>
  exportChat(format: 'md' | 'json'): Promise<boolean>
  openChat(id: string): Promise<ChatSnapshot>
  clearChat(): Promise<ChatSnapshot>
  getRuntimeInfo(): Promise<RuntimeInfo>
}

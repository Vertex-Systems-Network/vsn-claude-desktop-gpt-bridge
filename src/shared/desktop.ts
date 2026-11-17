import type { Project, ProjectAttachment, ProjectInput, ProjectListing } from './project'
import type { ChatChange, ChatSnapshot, SavedChat } from './chat'
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
  sendChat(model: string, prompt: string, attachment?: ProjectAttachment): Promise<ChatSnapshot>
  stopChat(): Promise<void>
  searchChats(query: string, archived: boolean): Promise<SavedChat[]>
  exportChat(format: 'md' | 'json'): Promise<boolean>
  changeChat(change: ChatChange): Promise<ChatSnapshot>
  openChat(id: string): Promise<ChatSnapshot>
  clearChat(): Promise<ChatSnapshot>
  grantProjectFiles(id: string): Promise<boolean>
  revokeProjectFiles(id: string): Promise<void>
  listProjectFiles(id: string, parts: string[]): Promise<ProjectListing>
  previewProjectFile(id: string, parts: string[]): Promise<string>
  listProjects(): Promise<Project[]>
  saveProject(input: ProjectInput): Promise<Project | null>
  deleteProject(id: string): Promise<boolean>
  getRuntimeInfo(): Promise<RuntimeInfo>
}

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
  signOut(): Promise<AccountStatus>
  getRuntimeInfo(): Promise<RuntimeInfo>
}

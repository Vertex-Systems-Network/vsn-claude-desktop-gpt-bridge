import { z } from 'zod'

export const runtimeInfo = z.strictObject({
  appVersion: z.string().min(1),
  electronVersion: z.string().min(1),
  platform: z.string().min(1),
})

export type RuntimeInfo = z.infer<typeof runtimeInfo>

export interface DesktopBridge {
  getRuntimeInfo(): Promise<RuntimeInfo>
}

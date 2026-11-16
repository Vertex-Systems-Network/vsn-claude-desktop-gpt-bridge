export const runtimeChannel = 'deskagent:runtime-info'
export const accountChannels = {
  status: 'deskagent:account-status',
  signIn: 'deskagent:account-sign-in',
  consent: 'deskagent:account-consent',
  cancel: 'deskagent:account-cancel',
  verifyPlan: 'deskagent:account-verify-plan',
  refresh: 'deskagent:account-refresh',
  signOut: 'deskagent:account-sign-out',
} as const
export const chatChannels = {
  status: 'deskagent:chat-status',
  models: 'deskagent:chat-models',
  send: 'deskagent:chat-send',
  stop: 'deskagent:chat-stop',
  clear: 'deskagent:chat-clear',
  open: 'deskagent:chat-open',
} as const

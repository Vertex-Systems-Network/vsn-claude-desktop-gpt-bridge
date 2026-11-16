export const runtimeChannel = 'deskagent:runtime-info'
export const accountChannels = {
  status: 'deskagent:account-status',
  signIn: 'deskagent:account-sign-in',
  consent: 'deskagent:account-consent',
  cancel: 'deskagent:account-cancel',
  signOut: 'deskagent:account-sign-out',
} as const

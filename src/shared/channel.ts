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
  change: 'deskagent:chat-change',
  search: 'deskagent:chat-search',
  export: 'deskagent:chat-export',
} as const
export const projectChannels = {
  list: 'deskagent:project-list',
  grantFiles: 'deskagent:project-grant-files',
  revokeFiles: 'deskagent:project-revoke-files',
  listFiles: 'deskagent:project-list-files',
  gitStatus: 'deskagent:project-git-status',
  previewFile: 'deskagent:project-preview-file',
  save: 'deskagent:project-save',
  delete: 'deskagent:project-delete',
} as const
export const mcpChannels = {
  choose: 'deskagent:mcp-choose',
  discover: 'deskagent:mcp-discover',
  call: 'deskagent:mcp-call',
  listProfiles: 'deskagent:mcp-list-profiles',
  saveProfile: 'deskagent:mcp-save-profile',
  removeProfile: 'deskagent:mcp-remove-profile',
} as const

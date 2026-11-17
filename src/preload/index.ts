import { contextBridge, ipcRenderer } from 'electron'
import { accountChannels, chatChannels, mcpChannels, projectChannels, runtimeChannel } from '../shared/channel'
import type { DesktopBridge } from '../shared/desktop'

const bridge: DesktopBridge = {
  getAccountStatus: () => ipcRenderer.invoke(accountChannels.status),
  signIn: () => ipcRenderer.invoke(accountChannels.signIn),
  enablePlan: () => ipcRenderer.invoke(accountChannels.consent),
  cancelSignIn: () => ipcRenderer.invoke(accountChannels.cancel),
  verifyPlan: () => ipcRenderer.invoke(accountChannels.verifyPlan),
  refreshAccount: () => ipcRenderer.invoke(accountChannels.refresh),
  signOut: () => ipcRenderer.invoke(accountChannels.signOut),
  getChat: () => ipcRenderer.invoke(chatChannels.status),
  loadChatModels: () => ipcRenderer.invoke(chatChannels.models),
  sendChat: (model, prompt, attachment) => ipcRenderer.invoke(chatChannels.send, model, prompt, attachment),
  stopChat: () => ipcRenderer.invoke(chatChannels.stop),
  searchChats: (query, archived) => ipcRenderer.invoke(chatChannels.search, query, archived),
  exportChat: (format) => ipcRenderer.invoke(chatChannels.export, format),
  changeChat: (change) => ipcRenderer.invoke(chatChannels.change, change),
  openChat: (id) => ipcRenderer.invoke(chatChannels.open, id),
  clearChat: () => ipcRenderer.invoke(chatChannels.clear),
  grantProjectFiles: (id) => ipcRenderer.invoke(projectChannels.grantFiles, id),
  revokeProjectFiles: (id) => ipcRenderer.invoke(projectChannels.revokeFiles, id),
  listProjectFiles: (id, parts) => ipcRenderer.invoke(projectChannels.listFiles, id, parts),
  previewProjectFile: (id, parts) => ipcRenderer.invoke(projectChannels.previewFile, id, parts),
  listProjects: () => ipcRenderer.invoke(projectChannels.list),
  saveProject: (input) => ipcRenderer.invoke(projectChannels.save, input),
  deleteProject: (id) => ipcRenderer.invoke(projectChannels.delete, id),
  listMcpProfiles: () => ipcRenderer.invoke(mcpChannels.listProfiles),
  saveMcpProfile: (profile) => ipcRenderer.invoke(mcpChannels.saveProfile, profile),
  removeMcpProfile: (id) => ipcRenderer.invoke(mcpChannels.removeProfile, id),
  chooseMcpExecutable: () => ipcRenderer.invoke(mcpChannels.choose),
  callMcp: (call) => ipcRenderer.invoke(mcpChannels.call, call),
  discoverMcp: (probe) => ipcRenderer.invoke(mcpChannels.discover, probe),
  async getRuntimeInfo() {
    return ipcRenderer.invoke(runtimeChannel)
  },
}
contextBridge.exposeInMainWorld('deskAgent', bridge)

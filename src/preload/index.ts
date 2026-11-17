import { contextBridge, ipcRenderer } from 'electron'
import { accountChannels, chatChannels, projectChannels, runtimeChannel } from '../shared/channel'
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
  sendChat: (model, prompt) => ipcRenderer.invoke(chatChannels.send, model, prompt),
  stopChat: () => ipcRenderer.invoke(chatChannels.stop),
  searchChats: (query, archived) => ipcRenderer.invoke(chatChannels.search, query, archived),
  exportChat: (format) => ipcRenderer.invoke(chatChannels.export, format),
  changeChat: (change) => ipcRenderer.invoke(chatChannels.change, change),
  openChat: (id) => ipcRenderer.invoke(chatChannels.open, id),
  clearChat: () => ipcRenderer.invoke(chatChannels.clear),
  listProjects: () => ipcRenderer.invoke(projectChannels.list),
  saveProject: (input) => ipcRenderer.invoke(projectChannels.save, input),
  deleteProject: (id) => ipcRenderer.invoke(projectChannels.delete, id),
  async getRuntimeInfo() {
    return ipcRenderer.invoke(runtimeChannel)
  },
}
contextBridge.exposeInMainWorld('deskAgent', bridge)

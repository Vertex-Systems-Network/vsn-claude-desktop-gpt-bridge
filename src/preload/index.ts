import { contextBridge, ipcRenderer } from 'electron'
import { accountChannels, chatChannels, runtimeChannel } from '../shared/channel'
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
  openChat: (id) => ipcRenderer.invoke(chatChannels.open, id),
  clearChat: () => ipcRenderer.invoke(chatChannels.clear),
  async getRuntimeInfo() {
    return ipcRenderer.invoke(runtimeChannel)
  },
}
contextBridge.exposeInMainWorld('deskAgent', bridge)

import { contextBridge, ipcRenderer } from 'electron'
import { accountChannels, runtimeChannel } from '../shared/channel'
import type { DesktopBridge } from '../shared/desktop'

const bridge: DesktopBridge = {
  getAccountStatus: () => ipcRenderer.invoke(accountChannels.status),
  signIn: () => ipcRenderer.invoke(accountChannels.signIn),
  enablePlan: () => ipcRenderer.invoke(accountChannels.consent),
  cancelSignIn: () => ipcRenderer.invoke(accountChannels.cancel),
  signOut: () => ipcRenderer.invoke(accountChannels.signOut),
  async getRuntimeInfo() {
    return ipcRenderer.invoke(runtimeChannel)
  },
}
contextBridge.exposeInMainWorld('deskAgent', bridge)

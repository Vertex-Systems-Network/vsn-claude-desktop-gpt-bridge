import { contextBridge, ipcRenderer } from 'electron'
import { runtimeChannel } from '../shared/channel'
import type { DesktopBridge } from '../shared/desktop'

const bridge: DesktopBridge = {
  async getRuntimeInfo() {
    return ipcRenderer.invoke(runtimeChannel)
  },
}
contextBridge.exposeInMainWorld('deskAgent', bridge)

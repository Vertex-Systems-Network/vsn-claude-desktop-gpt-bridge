import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { accountChannels, runtimeChannel } from '../shared/channel'
import { runtimeInfo } from '../shared/desktop'
import { decryptCredential, encryptCredential } from './auth/credential-protection'

import { AccountService } from './auth/account'
import { AccountStore } from './auth/store'

const rendererPath = join(__dirname, '../renderer/index.html')
const rendererUrl = !app.isPackaged && process.env.ELECTRON_RENDERER_URL
  ? process.env.ELECTRON_RENDERER_URL
  : pathToFileURL(rendererPath).href
const smoke = !app.isPackaged && process.argv.includes('--deskagent-smoke')
let mainWindow: BrowserWindow | undefined

function openWindow() {
  const window = new BrowserWindow({
    width: 1080,
    height: 740,
    minWidth: 500,
    minHeight: 420,
    title: 'DeskAgent',
    backgroundColor: '#17181b',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  mainWindow = window
  window.on('closed', () => { mainWindow = undefined })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => event.preventDefault())
  window.webContents.on('will-attach-webview', (event) => event.preventDefault())
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  window.webContents.session.setPermissionCheckHandler(() => false)
  return window
}

function handleRequest(channel: string, handler: () => unknown) {
  ipcMain.handle(channel, (event, ...args: unknown[]) => {
    const contents = mainWindow?.webContents
    if (!contents || event.sender !== contents || event.senderFrame !== contents.mainFrame ||
      event.senderFrame?.url !== new URL(rendererUrl).href || args.length !== 0) {
      throw new Error('Invalid desktop request')
    }
    return handler()
  })
}

async function start() {
  const account = new AccountService(new AccountStore(join(app.getPath('userData'), 'auth')))
  if (!smoke) await account.initialize()
  handleRequest(accountChannels.status, () => account.getStatus())
  handleRequest(accountChannels.signIn, () => account.signIn(false))
  handleRequest(accountChannels.consent, () => account.signIn(true))
  handleRequest(accountChannels.cancel, () => account.cancel())
  handleRequest(accountChannels.refresh, () => account.refresh())
  handleRequest(accountChannels.signOut, () => account.signOut())
  handleRequest(runtimeChannel, () => runtimeInfo.parse({
      appVersion: app.getVersion(),
      electronVersion: process.versions.electron,
      platform: process.platform,
  }))
  const window = openWindow()
  await window.loadURL(rendererUrl)
  if (smoke) {
    const verified: unknown = await window.webContents.executeJavaScript(`
      (async () => {
        const info = await window.deskAgent.getRuntimeInfo();
        const account = await window.deskAgent.getAccountStatus();
        for (let attempt = 0; attempt < 40 && !document.querySelector('main h1'); attempt++) {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        return info.platform === 'win32' && account.state === 'SIGNED_OUT' &&
          Object.keys(account).every((key) => ['state', 'busy', 'canRefresh', 'label', 'message', 'code'].includes(key)) &&
          typeof require === 'undefined' && typeof process === 'undefined' &&
          document.title === 'DeskAgent' && !!document.querySelector('main h1');
      })()
    `)
    if (verified !== true) throw new Error('DeskAgent renderer IPC smoke failed')
    const sentinel = 'DeskAgent synthetic credential'
    const encrypted = encryptCredential(sentinel)
    if (encrypted.includes(Buffer.from(sentinel)) || decryptCredential(encrypted) !== sentinel) {
      throw new Error('DeskAgent Windows credential protection smoke failed')
    }
    console.log('DeskAgent Windows startup, sandboxed IPC and DPAPI verified')
    app.exit(0)
  }
}

if (!smoke && !app.requestSingleInstanceLock()) app.quit()
else void app.whenReady().then(start).catch((error: unknown) => {
  console.error('DeskAgent startup failed', error)
  app.exit(1)
})
app.on('window-all-closed', () => app.quit())

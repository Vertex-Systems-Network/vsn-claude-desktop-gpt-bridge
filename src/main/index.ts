import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { mkdtemp, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { formatChatExport } from './storage/export'
import { isAbsolute, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { accountChannels, chatChannels, mcpChannels, projectChannels, runtimeChannel } from '../shared/channel'
import { maxPromptLength } from '../shared/chat'
import { listProjectFiles, previewProjectFile } from './projects/files'
import { Projects } from './storage/projects'
import { ChatHistory } from './storage/history'
import { ChatService } from './inference/chat'
import { z } from 'zod'
import { McpProfiles } from './mcp/profiles'
import { callMcpTool, discoverMcpTools, resolveMcpExecutable } from './mcp/discovery'
import { maxMcpArgumentsLength, parseMcpArguments } from '../shared/mcp-arguments'
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

function handleRequest(channel: string, handler: (...args: unknown[]) => unknown, arity = 0) {
  ipcMain.handle(channel, (event, ...args: unknown[]) => {
    const contents = mainWindow?.webContents
    if (!contents || event.sender !== contents || event.senderFrame !== contents.mainFrame ||
      event.senderFrame?.url !== new URL(rendererUrl).href || args.length !== arity) {
      throw new Error('Invalid desktop request')
    }
    return handler(...args)
  })
}

async function start() {
  const account = new AccountService(new AccountStore(join(app.getPath('userData'), 'auth')))
  if (!smoke) await account.initialize()
  let history: ChatHistory | undefined
  try {
    history = new ChatHistory(smoke ? ':memory:' : join(app.getPath('userData'), 'chat.sqlite3'))
  } catch (error) {
    if (smoke) throw error
    console.error('DeskAgent could not open local chat history.', error instanceof Error ? error.name : 'Unknown error')
  }
  let projects: Projects | undefined
  try {
    projects = new Projects(smoke ? ':memory:' : join(app.getPath('userData'), 'projects.sqlite3'))
  } catch (error) {
    if (smoke) throw error
    console.error('DeskAgent could not open projects storage.', error instanceof Error ? error.name : 'Unknown error')
  }
  const projectStorage = () => {
    if (!projects) throw new Error('Local project storage is unavailable.')
    return projects
  }
  const projectInput = z.strictObject({
    id: z.uuid().optional(),
    name: z.string().trim().min(1).max(120),
    instructions: z.string().max(12_000),
    chooseFolder: z.boolean(),
  })
  const folderGrants = new Map<string, string>()
  handleRequest(projectChannels.grantFiles, async (value) => {
    const id = z.uuid().parse(value)
    const storage = projectStorage()
    const project = storage.get(id)
    if (!mainWindow || !project) return false
    const choice = await dialog.showMessageBox(mainWindow, {
      type: 'question', buttons: ['Allow for this session', 'Cancel'], defaultId: 1, cancelId: 1,
      message: 'Allow read-only access to this project folder?',
      detail: project.folder,
    })
    if (choice.response !== 0 || storage.get(id)?.folder !== project.folder) return false
    folderGrants.set(id, project.folder)
    return true
  }, 1)
  const browseArgs = z.tuple([z.uuid(), z.array(z.string().min(1).max(255)).max(32)])
  const grantedRoot = (id: string) => {
    const project = projectStorage().get(id)
    if (!project || folderGrants.get(id) !== project.folder) {
      throw new Error('Read access is unavailable for this folder.')
    }
    return project.folder
  }
  handleRequest(projectChannels.listFiles, async (...args) => {
    const [id, parts] = browseArgs.parse(args)
    const root = grantedRoot(id)
    const result = await listProjectFiles(root, parts)
    if (grantedRoot(id) !== root) throw new Error('Project folder changed.')
    return result
  }, 2)
  handleRequest(projectChannels.previewFile, async (...args) => {
    const [id, parts] = browseArgs.parse(args)
    const root = grantedRoot(id)
    const text = await previewProjectFile(root, parts)
    if (grantedRoot(id) !== root) throw new Error('Project folder changed.')
    return text
  }, 2)
  handleRequest(projectChannels.revokeFiles, (value) => {
    folderGrants.delete(z.uuid().parse(value))
  }, 1)
  handleRequest(projectChannels.list, () => projectStorage().list())
  handleRequest(projectChannels.save, async (value) => {
    const input = projectInput.parse(value)
    const storage = projectStorage()
    const current = input.id ? storage.get(input.id) : undefined
    if (input.id && !current) throw new Error('Project no longer exists.')
    let folder = current?.folder
    if (!folder || input.chooseFolder) {
      if (!mainWindow) return null
      const selection = await dialog.showOpenDialog(mainWindow, {
        title: 'Select a local project folder',
        defaultPath: folder,
        properties: ['openDirectory'],
      })
      const chosen = selection.filePaths[0]
      if (selection.canceled || !chosen) return null
      if (!isAbsolute(chosen) || /^[\\/]{2}/.test(chosen)) {
        throw new Error('Choose a folder on a local drive.')
      }
      folder = await realpath(chosen)
      if (/^[\\/]{2}/.test(folder) || !(await stat(folder)).isDirectory()) {
        throw new Error('Choose a folder on a local drive.')
      }
    }
    const saved = storage.save({ name: input.name, instructions: input.instructions, folder }, input.id)
    if (current && current.folder !== saved.folder) folderGrants.delete(saved.id)
    return saved
  }, 1)
  handleRequest(projectChannels.delete, (value) => {
    const id = z.uuid().parse(value)
    folderGrants.delete(id)
    return projectStorage().delete(id)
  }, 1)
  const chat = new ChatService(() => account.chatAccessToken(), history, () => account.historyAccount(), (id) => projects?.get(id))
  if (smoke && history) {
    const id = history.append('smoke-profile', undefined, 0, 'smoke-model', 'smoke prompt')
    history.update('smoke-profile', id, 0, { prompt: 'smoke prompt', reply: 'smoke reply', phase: 'complete' })
    if (history.read('smoke-profile', id)?.[0]?.reply !== 'smoke reply' || history.read('other-profile', id)) {
      throw new Error('DeskAgent SQLite history smoke failed')
    }
  }
  handleRequest(chatChannels.open, (id) => {
    if (typeof id !== 'string' || !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/.test(id)) {
      throw new Error('Invalid conversation identifier')
    }
    return chat.open(id)
  }, 1)
  const chatChange = z.discriminatedUnion('action', [
    z.strictObject({ action: z.literal('temporary') }),
    z.strictObject({ action: z.literal('project'), id: z.uuid().nullable(), projectId: z.uuid().nullable() }),
    z.strictObject({ action: z.literal('rename'), id: z.uuid(), title: z.string().trim().min(1).max(160) }),
    z.strictObject({ action: z.enum(['archive', 'restore', 'delete']), id: z.uuid() }),
  ])
  handleRequest(chatChannels.change, (value) => chat.change(chatChange.parse(value)), 1)
  handleRequest(chatChannels.search, (query, archived) => {
    if (typeof query !== 'string' || query.length > 160 || typeof archived !== 'boolean') throw new Error('Invalid search query')
    return chat.find(query.trim(), archived)
  }, 2)
  handleRequest(chatChannels.export, async (format) => {
    if (format !== 'md' && format !== 'json') throw new Error('Invalid export format')
    const conversation = chat.exportConversation()
    if (!mainWindow || !conversation) return false
    const selected = await dialog.showSaveDialog(mainWindow, {
      title: 'Export conversation',
      defaultPath: 'deskagent-chat.' + format,
      filters: [{ name: format === 'json' ? 'JSON' : 'Markdown', extensions: [format] }],
    })
    if (selected.canceled || !selected.filePath) return false
    await writeFile(selected.filePath, formatChatExport(conversation, format), 'utf8')
    return true
  }, 1)
  handleRequest(chatChannels.status, () => chat.snapshot())
  handleRequest(chatChannels.models, () => chat.loadModels())
  handleRequest(chatChannels.stop, () => chat.stop())
  handleRequest(chatChannels.clear, () => chat.clear())
  handleRequest(chatChannels.send, async (model, prompt, attachment) => {
    if (typeof model !== 'string' || !model || model.length > 160 ||
      typeof prompt !== 'string' || !prompt.trim() || prompt.length > maxPromptLength) {
      throw new Error('Invalid chat request')
    }
    if (attachment === undefined) return chat.send(model, prompt.trim())
    const value = z.strictObject({
      projectId: z.uuid(),
      folder: z.string().min(1).max(32767),
      parts: z.array(z.string().min(1).max(255)).min(1).max(32),
    }).parse(attachment)
    const scope = account.historyAccount()
    const before = chat.snapshot()
    if (!scope || before.busy || before.temporary || before.projectId !== value.projectId) {
      throw new Error('Select the attachment’s project in the current chat before sending.')
    }
    const root = grantedRoot(value.projectId)
    if (root !== value.folder) throw new Error('The attachment’s project folder changed.')
    const text = await previewProjectFile(root, value.parts)
    const after = chat.snapshot()
    if (account.historyAccount() !== scope || grantedRoot(value.projectId) !== root || after.busy ||
      after.temporary || after.projectId !== before.projectId ||
      after.conversation !== before.conversation || after.turns.length !== before.turns.length) {
      throw new Error('The chat or project changed before the attachment could be sent.')
    }
    return chat.send(model, prompt.trim(), { name: value.parts.join('/'), text })
  }, 3)
  let mcpProfiles: McpProfiles | undefined
  const profileStorage = () => {
    mcpProfiles ??= new McpProfiles(smoke ? ':memory:' : join(app.getPath('userData'), 'mcp.sqlite3'))
    return mcpProfiles
  }
  if (smoke) {
    const directory = await mkdtemp(join(app.getPath('temp'), 'deskagent-mcp-'))
    try {
      const path = join(directory, 'profiles.sqlite3')
      const initial = new McpProfiles(path)
      try { initial.save({ name: 'Smoke server', executable: 'fixture.exe', args: ['fixture'] }) }
      finally { initial.close() }
      const reopened = new McpProfiles(path)
      try {
        const [stored] = reopened.list()
        if (stored?.name !== 'Smoke server' || stored.args[0] !== 'fixture') {
          throw new Error('DeskAgent MCP profile reopen smoke failed')
        }
        reopened.save({ ...stored, name: 'Renamed server' })
        if (reopened.list()[0]?.name !== 'Renamed server' || !reopened.remove(stored.id) || reopened.list().length) {
          throw new Error('DeskAgent MCP profile CRUD smoke failed')
        }
      } finally { reopened.close() }
    } finally { await rm(directory, { recursive: true, force: true }) }
  }
  handleRequest(mcpChannels.listProfiles, () => profileStorage().list())
  handleRequest(mcpChannels.removeProfile, (value) => profileStorage().remove(z.uuid().parse(value)), 1)
  let mcpBusy = false
  handleRequest(mcpChannels.choose, async () => {
    if (!mainWindow || smoke) return null
    const selection = await dialog.showOpenDialog(mainWindow, {
      title: 'Choose a local MCP server executable', properties: ['openFile'],
      filters: [{ name: 'Windows executable', extensions: ['exe'] }],
    })
    return selection.canceled || !selection.filePaths[0] ? null : resolveMcpExecutable(selection.filePaths[0])
  })
  const mcpProbe = z.strictObject({
    executable: z.string().min(1).max(32767),
    args: z.array(z.string().max(1024).refine((value) => !value.includes('\0') && !value.includes('\r') && !value.includes('\n'))).max(20),
  })
  const profileInput = mcpProbe.extend({ id: z.uuid().optional(), name: z.string().trim().min(1).max(80) })
  handleRequest(mcpChannels.saveProfile, async (value) => {
    const input = profileInput.parse(value)
    const executable = await resolveMcpExecutable(input.executable)
    return profileStorage().save({ ...input, executable })
  }, 1)
  handleRequest(mcpChannels.discover, async (value) => {
    if (!mainWindow || mcpBusy || smoke) return null
    const config = mcpProbe.parse(value)
    mcpBusy = true
    try {
      const executable = await resolveMcpExecutable(config.executable)
      const approval = await dialog.showMessageBox(mainWindow, {
        type: 'warning', buttons: ['Run once', 'Cancel'], defaultId: 1, cancelId: 1,
        message: 'Run this local program to discover its MCP tools?',
        detail: 'It runs with your Windows user permissions. Only run software you trust.\n\n' +
          JSON.stringify({ executable, args: config.args }, null, 2),
      })
      if (approval.response !== 0 || !mainWindow) return null
      return await discoverMcpTools({ executable, args: config.args })
    } finally { mcpBusy = false }
  }, 1)
  const mcpCall = mcpProbe.extend({ tool: z.string().min(1).max(128), argumentsJson: z.string().max(maxMcpArgumentsLength) })
  handleRequest(mcpChannels.call, async (value) => {
    if (!mainWindow || mcpBusy || smoke) return null
    const config = mcpCall.parse(value)
    const args = parseMcpArguments(config.argumentsJson)
    mcpBusy = true
    try {
      const executable = await resolveMcpExecutable(config.executable)
      const approval = await dialog.showMessageBox(mainWindow, {
        type: 'warning', buttons: ['Run tool once', 'Cancel'], defaultId: 1, cancelId: 1,
        message: 'Run this local MCP tool?',
        detail: 'This runs a local program with your Windows user permissions. Review the arguments before proceeding.\n\n' +
          JSON.stringify({ executable, launchArguments: config.args, tool: config.tool, toolArguments: args }, null, 2),
      })
      if (approval.response !== 0 || !mainWindow) return null
      return await callMcpTool({ executable, args: config.args }, config.tool, args)
    } finally { mcpBusy = false }
  }, 1)
  handleRequest(accountChannels.status, () => account.getStatus())
  handleRequest(accountChannels.signIn, () => chat.busy ? account.getStatus() : account.signIn(false))
  handleRequest(accountChannels.consent, () => chat.busy ? account.getStatus() : account.signIn(true))
  handleRequest(accountChannels.cancel, () => account.cancel())
  handleRequest(accountChannels.verifyPlan, () => chat.busy ? account.getStatus() : account.verifyPlan())
  handleRequest(accountChannels.refresh, () => chat.busy ? account.getStatus() : account.refresh())
  handleRequest(accountChannels.signOut, () => {
    if (chat.busy || account.getStatus().busy) return account.getStatus()
    return account.signOut()
  })
  handleRequest(runtimeChannel, () => runtimeInfo.parse({
      appVersion: app.getVersion(),
      electronVersion: process.versions.electron,
      platform: process.platform,
  }))
  const window = openWindow()
  window.on('closed', () => chat.stop())
  await window.loadURL(rendererUrl)
  if (smoke) {
    const verified: unknown = await window.webContents.executeJavaScript(`
      (async () => {
        const info = await window.deskAgent.getRuntimeInfo();
        const account = await window.deskAgent.getAccountStatus();
        for (let attempt = 0; attempt < 40 && !document.querySelector('main h1'); attempt++) {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        const profiles = await window.deskAgent.listMcpProfiles();
        const projects = await window.deskAgent.listProjects();
        const chat = await window.deskAgent.loadChatModels();
        return profiles.length === 0 && projects.length === 0 && !!document.querySelector('#projects-heading') && chat.models.length === 0 && chat.error.includes('CHAT_AUTH_REQUIRED') &&
          !!document.querySelector('#mcp-heading') && !!document.querySelector('#chat-prompt') && info.platform === 'win32' && account.state === 'SIGNED_OUT' &&
          Object.keys(account).every((key) => ['state', 'busy', 'canRefresh', 'verifiedModel', 'label', 'message', 'code'].includes(key)) &&
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
    console.log('DeskAgent Windows startup, sandboxed IPC and DPAPI verified; SQLite history verified')
    app.exit(0)
  }
}

if (!smoke && !app.requestSingleInstanceLock()) app.quit()
else void app.whenReady().then(start).catch((error: unknown) => {
  console.error('DeskAgent startup failed', error)
  app.exit(1)
})
app.on('window-all-closed', () => app.quit())

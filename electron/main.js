const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')
const { spawn } = require('child_process')
const UpdateManager = require('./updater')

function getConfigPath() {
  return path.join(app.getPath('userData'), 'anya-ide-config.json')
}

let mainWindow = null
let terminalProcesses = new Map()
let terminalCounter = 0
let updateManager = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#FFF5EE',
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.loadFile(path.join(__dirname, '..', 'src', 'index.html'))

  mainWindow.on('closed', () => { mainWindow = null })

  buildMenu()

  initUpdater()
}

function buildMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        { label: 'New File', accelerator: 'CmdOrCtrl+N', click: () => mainWindow?.webContents.send('menu-action', 'new-file') },
        { label: 'Open File...', accelerator: 'CmdOrCtrl+O', click: () => mainWindow?.webContents.send('menu-action', 'open-file') },
        { label: 'Open Folder...', accelerator: 'CmdOrCtrl+K', click: () => mainWindow?.webContents.send('menu-action', 'open-folder') },
        { type: 'separator' },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => mainWindow?.webContents.send('menu-action', 'save-file') },
        { label: 'Save As...', accelerator: 'CmdOrCtrl+Shift+S', click: () => mainWindow?.webContents.send('menu-action', 'save-as') },
        { type: 'separator' },
        { label: 'Settings', accelerator: 'CmdOrCtrl+,', click: () => mainWindow?.webContents.send('menu-action', 'settings') },
        { type: 'separator' },
        { label: 'Exit', role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
        { label: 'Redo', accelerator: 'CmdOrCtrl+Shift+Z', role: 'redo' },
        { type: 'separator' },
        { label: 'Cut', accelerator: 'CmdOrCtrl+X', role: 'cut' },
        { label: 'Copy', accelerator: 'CmdOrCtrl+C', role: 'copy' },
        { label: 'Paste', accelerator: 'CmdOrCtrl+V', role: 'paste' },
        { type: 'separator' },
        { label: 'Find', accelerator: 'CmdOrCtrl+F', click: () => mainWindow?.webContents.send('menu-action', 'find') }
      ]
    },
    {
      label: 'View',
      submenu: [
        { label: 'Toggle Sidebar', accelerator: 'CmdOrCtrl+B', click: () => mainWindow?.webContents.send('menu-action', 'toggle-sidebar') },
        { label: 'Toggle Terminal', accelerator: 'CmdOrCtrl+`', click: () => mainWindow?.webContents.send('menu-action', 'toggle-terminal') },
        { label: 'Toggle AI Chat', accelerator: 'CmdOrCtrl+Shift+A', click: () => mainWindow?.webContents.send('menu-action', 'toggle-chat') },
        { type: 'separator' },
        { label: 'Command Palette...', accelerator: 'CmdOrCtrl+Shift+P', click: () => mainWindow?.webContents.send('menu-action', 'command-palette') },
        { type: 'separator' },
        { label: 'Zoom In', accelerator: 'CmdOrCtrl+=', role: 'zoomIn' },
        { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', role: 'zoomOut' },
        { label: 'Reset Zoom', accelerator: 'CmdOrCtrl+0', role: 'resetZoom' },
        { type: 'separator' },
        { label: 'Toggle Developer Tools', accelerator: 'F12', role: 'toggleDevTools' }
      ]
    },
    {
      label: 'AI',
      submenu: [
        { label: 'Toggle AI Chat', accelerator: 'CmdOrCtrl+Shift+A', click: () => mainWindow?.webContents.send('menu-action', 'toggle-chat') },
        { label: 'Configure Provider...', click: () => mainWindow?.webContents.send('menu-action', 'settings') },
        { type: 'separator' },
        { label: 'Explain Code', click: () => mainWindow?.webContents.send('menu-action', 'explain-code') },
        { label: 'Fix with AI', click: () => mainWindow?.webContents.send('menu-action', 'fix-with-ai') }
      ]
    },
    {
      label: 'Help',
      submenu: [
        { label: 'About Anya IDE', click: () => mainWindow?.webContents.send('menu-action', 'about') },
        { type: 'separator' },
        { label: 'Keyboard Shortcuts', accelerator: 'CmdOrCtrl+Shift+K', click: () => mainWindow?.webContents.send('menu-action', 'shortcuts') }
      ]
    }
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  for (const [id, proc] of terminalProcesses) {
    proc.kill()
    terminalProcesses.delete(id)
  }
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (mainWindow === null) createWindow()
})

function initUpdater() {
  updateManager = new UpdateManager(mainWindow)

  var configPath = getConfigPath()
  try {
    if (fs.existsSync(configPath)) {
      var config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      if (config.update) {
        updateManager.setConfig(config.update)
      }
    }
  } catch(e) {}

  setTimeout(function() {
    updateManager.checkForUpdates().then(function(result) {
      if (result.success && result.hasUpdate) {
        try {
          var config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
          var updateConfig = config.update || {}
          var skipVersion = updateConfig.skipVersion || ''
          var remindLaterUntil = updateConfig.remindLaterUntil || 0

          if (skipVersion === result.latestVersion) return
          if (remindLaterUntil > Date.now()) return

          updateManager.handleCheckResult(result)
        } catch(e) {
          updateManager.handleCheckResult(result)
        }
      }
    })
    updateManager.startPeriodicCheck()
  }, 3000)
}

ipcMain.handle('update-check', async () => {
  if (!updateManager) return { success: false, error: 'Updater not initialized' }
  var result = await updateManager.checkForUpdates()
  return result
})

ipcMain.handle('update-download', async () => {
  if (!updateManager) return { success: false, error: 'Updater not initialized' }
  updateManager.downloadUpdate()
  return { success: true }
})

ipcMain.handle('update-install', async () => {
  if (!updateManager) return { success: false, error: 'Updater not initialized' }
  updateManager.installUpdate()
  return { success: true }
})

ipcMain.handle('update-remind-later', async () => {
  var configPath = getConfigPath()
  try {
    var config = {}
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    }
    if (!config.update) config.update = {}
    config.update.remindLaterUntil = Date.now() + 86400000
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('update-skip-version', async (event, version) => {
  var configPath = getConfigPath()
  try {
    var config = {}
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    }
    if (!config.update) config.update = {}
    config.update.skipVersion = version
    config.update.remindLaterUntil = 0
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.on('window-minimize', () => mainWindow?.minimize())
ipcMain.on('window-maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize()
  else mainWindow?.maximize()
})
ipcMain.on('window-close', () => mainWindow?.close())

ipcMain.handle('dialog-open-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'All Files', extensions: ['*'] }]
  })
  if (result.canceled) return null
  const filePath = result.filePaths[0]
  const content = fs.readFileSync(filePath, 'utf-8')
  return { filePath, content, fileName: path.basename(filePath) }
})

ipcMain.handle('dialog-open-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  })
  if (result.canceled) return null
  return result.filePaths[0]
})

ipcMain.handle('dialog-save-file', async (event, { filePath, content }) => {
  if (!filePath) {
    const result = await dialog.showSaveDialog(mainWindow, {
      filters: [{ name: 'All Files', extensions: ['*'] }]
    })
    if (result.canceled) return null
    filePath = result.filePath
  }
  fs.writeFileSync(filePath, content, 'utf-8')
  return filePath
})

ipcMain.handle('read-file', (event, filePath) => {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    return { success: true, content }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('write-file', (event, { filePath, content }) => {
  try {
    fs.writeFileSync(filePath, content, 'utf-8')
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('read-directory', (event, dirPath) => {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true })
    const items = entries.map(entry => {
      const fullPath = path.join(dirPath, entry.name)
      let stat
      try { stat = fs.statSync(fullPath) } catch { stat = null }
      return {
        name: entry.name,
        path: fullPath,
        isDirectory: entry.isDirectory(),
        isFile: entry.isFile(),
        size: stat?.size || 0,
        modifiedAt: stat?.mtimeMs || 0
      }
    }).sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1
      if (!a.isDirectory && b.isDirectory) return 1
      return a.name.localeCompare(b.name)
    })
    return { success: true, items, path: dirPath }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('get-file-icon', (event, filePath) => {
  const ext = path.extname(filePath).toLowerCase()
  const iconMap = {
    '.js': 'javascript', '.ts': 'typescript', '.tsx': 'react', '.jsx': 'react',
    '.html': 'html', '.css': 'css', '.scss': 'sass', '.json': 'json',
    '.md': 'markdown', '.py': 'python', '.rs': 'rust', '.go': 'go',
    '.java': 'java', '.cpp': 'cpp', '.c': 'c', '.h': 'header',
    '.yml': 'yaml', '.yaml': 'yaml', '.toml': 'toml', '.xml': 'xml',
    '.svg': 'svg', '.png': 'image', '.jpg': 'image', '.jpeg': 'image',
    '.gif': 'image', '.ico': 'image', '.woff': 'font', '.woff2': 'font',
    '.eot': 'font', '.ttf': 'font', '.txt': 'text', '.env': 'env',
    '.gitignore': 'git', '.dockerfile': 'docker', '.sh': 'shell',
    '.bat': 'shell', '.ps1': 'powershell', '.exe': 'binary',
    '.dll': 'binary', '.sql': 'database', '.csv': 'table'
  }
  return iconMap[ext] || 'file'
})

ipcMain.handle('home-dir', () => os.homedir())

ipcMain.handle('file-exists', (event, filePath) => {
  try { return fs.existsSync(filePath) } catch { return false }
})

ipcMain.handle('create-file', (event, filePath) => {
  try {
    fs.writeFileSync(filePath, '', 'utf-8')
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('create-directory', (event, dirPath) => {
  try {
    fs.mkdirSync(dirPath, { recursive: true })
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('delete-entry', (event, entryPath) => {
  try {
    fs.rmSync(entryPath, { recursive: true, force: true })
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('rename-entry', (event, { oldPath, newPath }) => {
  try {
    fs.renameSync(oldPath, newPath)
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('terminal-create', (event) => {
  const id = ++terminalCounter
  const shell = process.platform === 'win32' ? (process.env.COMSPEC || 'cmd.exe') : (process.env.SHELL || '/bin/bash')
  const proc = spawn(shell, [], {
    env: { ...process.env, TERM: 'xterm-256color' },
    stdio: ['pipe', 'pipe', 'pipe']
  })

  terminalProcesses.set(id, proc)

  proc.stdout.on('data', (data) => {
    mainWindow?.webContents.send('terminal-data', { id, data: data.toString() })
  })

  proc.stderr.on('data', (data) => {
    mainWindow?.webContents.send('terminal-data', { id, data: data.toString() })
  })

  proc.on('exit', () => {
    terminalProcesses.delete(id)
    mainWindow?.webContents.send('terminal-exit', { id })
  })

  proc.on('error', (err) => {
    mainWindow?.webContents.send('terminal-error', { id, error: err.message })
  })

  return id
})

ipcMain.handle('terminal-write', (event, { id, data }) => {
  const proc = terminalProcesses.get(id)
  if (proc) proc.stdin.write(data)
})

ipcMain.handle('terminal-resize', (event, { id, cols, rows }) => {
  const proc = terminalProcesses.get(id)
  if (proc && proc.stdout) {
    try {
      process.stdout.columns = cols
      process.stdout.rows = rows
    } catch {}
  }
})

ipcMain.handle('terminal-kill', (event, id) => {
  const proc = terminalProcesses.get(id)
  if (proc) {
    proc.kill()
    terminalProcesses.delete(id)
  }
})

ipcMain.handle('config-read', () => {
  try {
    if (fs.existsSync(getConfigPath())) {
      return { success: true, config: JSON.parse(fs.readFileSync(getConfigPath(), 'utf-8')) }
    }
    return { success: true, config: {} }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('config-write', (event, config) => {
  try {
    fs.writeFileSync(getConfigPath(), JSON.stringify(config, null, 2), 'utf-8')
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('platform', () => process.platform)
ipcMain.handle('is-maximized', () => mainWindow?.isMaximized() || false)
ipcMain.handle('toggle-dev-tools', () => mainWindow?.webContents.toggleDevTools())

function gitExec(args, cwd) {
  return new Promise((resolve) => {
    const proc = spawn('git', args, { cwd })
    let stdout = '', stderr = ''
    proc.stdout.on('data', (d) => { stdout += d.toString() })
    proc.stderr.on('data', (d) => { stderr += d.toString() })
    proc.on('close', (code) => {
      resolve({ success: code === 0, stdout: stdout.trim(), stderr: stderr.trim(), code })
    })
  })
}

ipcMain.handle('git-is-repo', async (event, repoPath) => {
  try { return fs.existsSync(path.join(repoPath, '.git')) } catch { return false }
})

ipcMain.handle('git-status', async (event, repoPath) => {
  const r = await gitExec(['status', '--porcelain', '-u'], repoPath)
  if (!r.success) return { success: false, error: r.stderr }
  const files = r.stdout.split('\n').filter(l => l).map(l => ({
    raw: l,
    x: l[0], y: l[1],
    path: l.substring(3).trim(),
    staged: l[0] !== ' ' && l[0] !== '?',
    status: l[0] === '?' ? 'U' : (l[0] !== ' ' ? l[0] : l[1])
  }))
  return { success: true, files, branch: await getCurrentBranch(repoPath) }
})

async function getCurrentBranch(repoPath) {
  const r = await gitExec(['rev-parse', '--abbrev-ref', 'HEAD'], repoPath)
  return r.success ? r.stdout : 'unknown'
}

ipcMain.handle('git-branch-list', async (event, repoPath) => {
  const r = await gitExec(['branch', '-a'], repoPath)
  if (!r.success) return { success: false, error: r.stderr }
  const current = await getCurrentBranch(repoPath)
  const branches = r.stdout.split('\n').filter(l => l).map(l => ({
    name: l.replace('* ', '').trim(),
    current: l.startsWith('*')
  }))
  return { success: true, branches, current }
})

ipcMain.handle('git-stage', async (event, { repoPath, filePath }) => {
  const r = await gitExec(['add', filePath], repoPath)
  return r.success ? { success: true } : { success: false, error: r.stderr }
})

ipcMain.handle('git-unstage', async (event, { repoPath, filePath }) => {
  const r = await gitExec(['reset', 'HEAD', filePath], repoPath)
  return r.success ? { success: true } : { success: false, error: r.stderr }
})

ipcMain.handle('git-commit', async (event, { repoPath, message }) => {
  const r = await gitExec(['commit', '-m', message], repoPath)
  return r.success ? { success: true, stdout: r.stdout } : { success: false, error: r.stderr }
})

ipcMain.handle('git-push', async (event, repoPath) => {
  const r = await gitExec(['push'], repoPath)
  return r.success ? { success: true, stdout: r.stdout } : { success: false, error: r.stderr }
})

ipcMain.handle('git-pull', async (event, repoPath) => {
  const r = await gitExec(['pull'], repoPath)
  return r.success ? { success: true, stdout: r.stdout } : { success: false, error: r.stderr }
})

ipcMain.handle('git-log', async (event, repoPath) => {
  const r = await gitExec(['log', '--oneline', '-20'], repoPath)
  if (!r.success) return { success: false, error: r.stderr }
  const entries = r.stdout.split('\n').filter(l => l).map(l => {
    const space = l.indexOf(' ')
    return { hash: l.substring(0, space), message: l.substring(space + 1) }
  })
  return { success: true, entries }
})

ipcMain.handle('git-init', async (event, repoPath) => {
  const r = await gitExec(['init'], repoPath)
  return r.success ? { success: true } : { success: false, error: r.stderr }
})

ipcMain.handle('git-checkout', async (event, { repoPath, branch }) => {
  const r = await gitExec(['checkout', branch], repoPath)
  return r.success ? { success: true } : { success: false, error: r.stderr }
})

ipcMain.handle('git-diff', async (event, { repoPath, filePath }) => {
  const r = await gitExec(['diff', filePath], repoPath)
  return r.success ? { success: true, diff: r.stdout } : { success: false, error: r.stderr }
})

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('anya', {
  platform: () => ipcRenderer.invoke('platform'),
  isMaximized: () => ipcRenderer.invoke('is-maximized'),
  homeDir: () => ipcRenderer.invoke('home-dir'),

  window: {
    minimize: () => ipcRenderer.send('window-minimize'),
    maximize: () => ipcRenderer.send('window-maximize'),
    close: () => ipcRenderer.send('window-close')
  },

  dialog: {
    openFile: () => ipcRenderer.invoke('dialog-open-file'),
    openFolder: () => ipcRenderer.invoke('dialog-open-folder'),
    saveFile: (opts) => ipcRenderer.invoke('dialog-save-file', opts)
  },

  fileSystem: {
    readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
    writeFile: (filePath, content) => ipcRenderer.invoke('write-file', { filePath, content }),
    readDirectory: (dirPath) => ipcRenderer.invoke('read-directory', dirPath),
    getFileIcon: (filePath) => ipcRenderer.invoke('get-file-icon', filePath),
    fileExists: (filePath) => ipcRenderer.invoke('file-exists', filePath),
    createFile: (filePath) => ipcRenderer.invoke('create-file', filePath),
    createDirectory: (dirPath) => ipcRenderer.invoke('create-directory', dirPath),
    deleteEntry: (entryPath) => ipcRenderer.invoke('delete-entry', entryPath),
    renameEntry: (oldPath, newPath) => ipcRenderer.invoke('rename-entry', { oldPath, newPath }),
    getHomeDir: () => ipcRenderer.invoke('home-dir')
  },

  terminal: {
    create: () => ipcRenderer.invoke('terminal-create'),
    write: (id, data) => ipcRenderer.invoke('terminal-write', { id, data }),
    resize: (id, cols, rows) => ipcRenderer.invoke('terminal-resize', { id, cols, rows }),
    kill: (id) => ipcRenderer.invoke('terminal-kill', { id }),
    onData: (callback) => {
      const listener = (event, data) => callback(data)
      ipcRenderer.on('terminal-data', listener)
      return () => ipcRenderer.removeListener('terminal-data', listener)
    },
    onExit: (callback) => {
      const listener = (event, data) => callback(data)
      ipcRenderer.on('terminal-exit', listener)
      return () => ipcRenderer.removeListener('terminal-exit', listener)
    }
  },

  menu: {
    onAction: (callback) => {
      const listener = (event, action) => callback(action)
      ipcRenderer.on('menu-action', listener)
      return () => ipcRenderer.removeListener('menu-action', listener)
    }
  },

  config: {
    read: () => ipcRenderer.invoke('config-read'),
    write: (config) => ipcRenderer.invoke('config-write', config)
  },

  devTools: () => ipcRenderer.invoke('toggle-dev-tools'),

  ai: {
    proxy: (opts) => ipcRenderer.invoke('ai-proxy', opts),
    abort: (requestId) => ipcRenderer.invoke('ai-abort', requestId),
    fetchOllamaModels: () => ipcRenderer.invoke('ai-fetch-ollama-models'),
    fetchOpenRouterModels: (apiKey) => ipcRenderer.invoke('ai-fetch-openrouter-models', apiKey),
    onStreamChunk: (callback) => {
      const listener = (event, data) => callback(data)
      ipcRenderer.on('ai-stream-chunk', listener)
      return () => ipcRenderer.removeListener('ai-stream-chunk', listener)
    }
  },

  update: {
    check: () => ipcRenderer.invoke('update-check'),
    download: () => ipcRenderer.invoke('update-download'),
    install: () => ipcRenderer.invoke('update-install'),
    manualCheck: () => ipcRenderer.invoke('update-manual-check'),
    pause: () => ipcRenderer.invoke('update-pause'),
    resume: () => ipcRenderer.invoke('update-resume'),
    cancel: () => ipcRenderer.invoke('update-cancel'),
    remindLater: () => ipcRenderer.invoke('update-remind-later'),
    skipVersion: (version) => ipcRenderer.invoke('update-skip-version', version),
    onNotification: (callback) => {
      const listener = (event, data) => callback(data.event, data.data)
      ipcRenderer.on('update-event', listener)
      return () => ipcRenderer.removeListener('update-event', listener)
    },
    onDownloadProgress: (callback) => {
      const listener = (event, data) => callback(data)
      ipcRenderer.on('update-download-progress', listener)
      return () => ipcRenderer.removeListener('update-download-progress', listener)
    }
  },

  git: {
    isRepo: (repoPath) => ipcRenderer.invoke('git-is-repo', repoPath),
    status: (repoPath) => ipcRenderer.invoke('git-status', repoPath),
    branchList: (repoPath) => ipcRenderer.invoke('git-branch-list', repoPath),
    stage: (repoPath, filePath) => ipcRenderer.invoke('git-stage', { repoPath, filePath }),
    unstage: (repoPath, filePath) => ipcRenderer.invoke('git-unstage', { repoPath, filePath }),
    commit: (repoPath, message) => ipcRenderer.invoke('git-commit', { repoPath, message }),
    push: (repoPath) => ipcRenderer.invoke('git-push', repoPath),
    pull: (repoPath) => ipcRenderer.invoke('git-pull', repoPath),
    log: (repoPath) => ipcRenderer.invoke('git-log', repoPath),
    init: (repoPath) => ipcRenderer.invoke('git-init', repoPath),
    checkout: (repoPath, branch) => ipcRenderer.invoke('git-checkout', { repoPath, branch }),
    diff: (repoPath, filePath) => ipcRenderer.invoke('git-diff', { repoPath, filePath })
  }
})

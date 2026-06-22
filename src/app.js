function AnyaApp() {
  var self = this

  this.sidebarVisible = true
  this.terminal = null

  try { this.titleBar = new TitleBar() } catch(e) { console.error('TitleBar init failed:', e) }
  try { this.editorManager = new EditorManager() } catch(e) { console.error('EditorManager init failed:', e) }
  try { this.sidebar = new Sidebar(function(filePath) { self.editorManager && self.editorManager.openFile(filePath) }) } catch(e) { console.error('Sidebar init failed:', e) }
  try { this.statusBar = new StatusBar() } catch(e) { console.error('StatusBar init failed:', e) }
  try { this.chat = new ChatPanel(function() { return self.getEditorContext() }) } catch(e) { console.error('ChatPanel init failed:', e) }
  try { this.commandPalette = new CommandPalette(function(cmd) { self.handleCommand(cmd) }) } catch(e) { console.error('CommandPalette init failed:', e) }
  try { this.initTerminal() } catch(e) { console.error('Terminal init failed:', e) }
  try { this.settings = new SettingsPage() } catch(e) { console.error('SettingsPage init failed:', e) }
  try { this.updateNotification = new UpdateNotification() } catch(e) { console.error('UpdateNotification init failed:', e) }

  try { this.initKeybindings() } catch(e) { console.error('Keybindings init failed:', e) }
  try { this.initMenuEvents() } catch(e) { console.error('MenuEvents init failed:', e) }
  try { this.initEditorEvents() } catch(e) { console.error('EditorEvents init failed:', e) }
  try { this.showWelcome() } catch(e) { console.error('Welcome init failed:', e) }
  try { this.initMenuListener() } catch(e) { console.error('MenuListener init failed:', e) }
  try { this.initSearchEvents() } catch(e) { console.error('SearchEvents init failed:', e) }
  try { this.applySavedAppearance() } catch(e) { console.error('Appearance apply failed:', e) }
}

AnyaApp.prototype.applySavedAppearance = async function() {
  try {
    var result = await window.anya.config.read()
    if (result.success && result.config && result.config.appearance) {
      var app = result.config.appearance
      var root = document.documentElement
      if (app.primaryColor) root.style.setProperty('--anya-primary', app.primaryColor)
      if (app.bgColor) root.style.setProperty('--anya-bg', app.bgColor)
      if (app.textColor) root.style.setProperty('--anya-text', app.textColor)
      if (app.fontSize) root.style.setProperty('--font-size', app.fontSize + 'px')
    }
  } catch(e) {}
}

AnyaApp.prototype.initTerminal = function() {
  this.terminal = new TerminalPanel()
}

AnyaApp.prototype.initKeybindings = function() {
  var self = this
  document.addEventListener('keydown', function(e) {
    var ctrl = e.ctrlKey || e.metaKey

    if (ctrl && e.shiftKey && e.key === 'P') { e.preventDefault(); self.commandPalette.toggle() }
    else if (ctrl && e.shiftKey && e.key === 'A') { e.preventDefault(); self.chat.toggle() }
    else if (ctrl && e.key === '`') { e.preventDefault(); self.terminal.toggle() }
    else if (ctrl && e.key === 'b') { e.preventDefault(); self.toggleSidebar() }
    else if (ctrl && e.key === 's') { e.preventDefault(); self.editorManager.saveCurrentFile() }
    else if (ctrl && e.key === 'n') { e.preventDefault(); self.newFile() }
    else if (ctrl && e.key === 'o') { e.preventDefault(); self.openFile() }
    else if (ctrl && e.shiftKey && e.key === 'K') {
      e.preventDefault()
      self.commandPalette.show()
      document.getElementById('command-input').value = 'shortcuts'
      self.commandPalette.filter()
    }
  })
}

AnyaApp.prototype.initMenuEvents = function() {
  var self = this
  document.addEventListener('menu-trigger', function(e) { self.handleCommand(e.detail) })
}

AnyaApp.prototype.initEditorEvents = function() {
  var self = this
  setInterval(function() {
    if (self.editorManager.editor) {
      try {
        var pos = self.editorManager.editor.getPosition()
        var model = self.editorManager.editor.getModel()
        if (pos && model) {
          self.statusBar.updateEditor({ line: pos.lineNumber, col: pos.column, language: model.getLanguageId(), encoding: 'UTF-8' })
        }
      } catch(e) {}
    }
  }, 200)
}

AnyaApp.prototype.initSearchEvents = function() {
  var self = this
  document.addEventListener('search-goto-line', function(e) {
    if (self.editorManager.editor) {
      var line = e.detail
      self.editorManager.editor.focus()
      self.editorManager.editor.setPosition({ lineNumber: line, column: 1 })
      self.editorManager.editor.revealLineInCenter(line)
    }
  })
}

AnyaApp.prototype.initMenuListener = function() {
  var self = this
  window.anya.menu.onAction(function(action) { self.handleCommand(action) })
}

AnyaApp.prototype.getEditorContext = function() {
  var editor = this.editorManager.editor
  if (!editor) return null

  var model = editor.getModel()
  if (!model) return null

  var tab = null
  for (var i = 0; i < this.editorManager.tabs.length; i++) {
    if (this.editorManager.tabs[i].id === this.editorManager.activeTabId) { tab = this.editorManager.tabs[i]; break }
  }

  var sel = editor.getSelection()
  var selectedText = model.getValueInRange(sel) || ''

  return {
    filePath: tab ? tab.filePath : null,
    language: model.getLanguageId(),
    fileContent: model.getValue(),
    selectedText: selectedText
  }
}

AnyaApp.prototype.handleCommand = function(cmd) {
  switch (cmd) {
    case 'new-file': this.newFile(); break
    case 'open-file': this.openFile(); break
    case 'open-folder': this.openFolder(); break
    case 'save-file': this.editorManager.saveCurrentFile(); break
    case 'save-as': this.saveAs(); break
    case 'toggle-sidebar': this.toggleSidebar(); break
    case 'toggle-terminal': this.terminal.toggle(); break
    case 'toggle-chat': this.chat.toggle(); break
    case 'configure-provider': this.settings.toggle(this.chat.aiProvider); break
    case 'explain-code': this.explainCode(); break
    case 'fix-with-ai': this.fixWithAI(); break
    case 'command-palette': this.commandPalette.toggle(); break
    case 'find': this.findInFile(); break
    case 'undo': document.execCommand('undo'); break
    case 'redo': document.execCommand('redo'); break
    case 'devtools':
    case 'toggle-dev-tools':
      window.anya.devTools()
      break
    case 'shortcuts': this.showShortcuts(); break
    case 'check-updates':
      window.anya.update.manualCheck().then(function(result) {
        if (result.success && !result.hasUpdate) {
          AnyaToast.success("You're up to date! ✅")
        }
      })
      break
    case 'settings': this.settings.toggle(this.chat.aiProvider); break
    case 'about': this.showAbout(); break
    case 'exit': window.anya.window.close(); break
    case 'plan': this.handleAICommand('plan'); break
    case 'build': this.handleAICommand('build'); break
    case 'review': this.handleAICommand('review'); break
    case 'fix': this.handleAICommand('fix'); break
    case 'test': this.handleAICommand('test'); break
    case 'deploy': this.handleAICommand('deploy'); break
    case 'commit': this.handleAICommand('commit'); break
    case 'explain': this.handleAICommand('explain'); break
  }
}

AnyaApp.prototype.initAI = function() {
  var self = this
  this.chat.setActiveSkills([])
  this.chat.setAgentMode('chat')
}

AnyaApp.prototype.handleAICommand = function(cmd) {
  var self = this

  switch (cmd) {
    case 'plan': this.chat.setAgentMode('plan'); break
    case 'build': this.chat.setAgentMode('build'); break
    case 'review': this.chat.setAgentMode('review'); break
    case 'fix': this.chat.setAgentMode('debug'); break
    case 'test': this.chat.sendMessage('Generate and run tests for the current project'); break
    case 'deploy': this.chat.setAgentMode('deploy'); break
    case 'commit': this.chat.sendMessage('Create a git commit with a descriptive message'); break
    case 'explain': this.chat.sendMessage('Explain the current code in detail'); break
    default: this.chat.sendMessage(cmd)
  }
}


AnyaApp.prototype.newFile = function() {
  var self = this
  var name = prompt('File name:')
  if (!name) return
  if (this.sidebar.currentFolder) {
    (async function() {
      var filePath = self.sidebar.currentFolder + '\\' + name
      await window.anya.fileSystem.createFile(filePath)
      await self.editorManager.openFile(filePath)
      self.sidebar.refresh()
    })()
  } else {
    var tabId = this.editorManager.nextTabId++
    this.editorManager.tabs.push({ id: tabId, filePath: null, name: name, language: 'plaintext', savedContent: '' })
    this.editorManager.renderTabs()
    this.editorManager.setActiveTab(this.editorManager.tabs[this.editorManager.tabs.length - 1].id)
    if (this.editorManager.editor) this.editorManager.editor.setValue('')
  }
}

AnyaApp.prototype.openFile = function() {
  var self = this
  ;(async function() {
    var result = await window.anya.dialog.openFile()
    if (result) {
      await self.editorManager.openFile(result.filePath)
      if (!self.sidebar.currentFolder) {
        var dir = result.filePath.substring(0, result.filePath.length - result.fileName.length)
        self.sidebar.currentFolder = dir
        self.sidebar.loadFolder(dir)
      }
    }
  })()
}

AnyaApp.prototype.openFolder = function() {
  var self = this
  ;(async function() {
    var folderPath = await window.anya.dialog.openFolder()
    if (folderPath) {
      self.sidebar.currentFolder = folderPath
      await self.sidebar.loadFolder(folderPath)
    }
  })()
}

AnyaApp.prototype.saveAs = function() {
  var self = this
  ;(async function() {
    var tab = null
    for (var i = 0; i < self.editorManager.tabs.length; i++) {
      if (self.editorManager.tabs[i].id === self.editorManager.activeTabId) { tab = self.editorManager.tabs[i]; break }
    }
    if (!tab) return
    var content = self.editorManager.editor ? self.editorManager.editor.getValue() : ''
    var savedPath = await window.anya.dialog.saveFile({ filePath: null, content: content })
    if (savedPath) {
      tab.filePath = savedPath
      tab.name = savedPath.split('\\').pop().split('/').pop()
      self.editorManager.renderTabs()
      self.sidebar.refresh()
    }
  })()
}

AnyaApp.prototype.toggleSidebar = function() {
  var sidebar = document.getElementById('sidebar')
  this.sidebarVisible = !this.sidebarVisible
  sidebar.classList.toggle('collapsed', !this.sidebarVisible)
}

AnyaApp.prototype.explainCode = function() {
  var ctx = this.getEditorContext()
  if (!ctx || !ctx.selectedText) { alert('Select some code first.'); return }
  this.chat.show()
  this.chat.inputEl.value = 'Explain this ' + ctx.language + ' code:\n\n```' + ctx.language + '\n' + ctx.selectedText + '\n```'
  this.chat.sendMessage()
}

AnyaApp.prototype.fixWithAI = function() {
  var ctx = this.getEditorContext()
  if (!ctx || !ctx.selectedText) { alert('Select some code first.'); return }
  this.chat.show()
  this.chat.inputEl.value = 'Fix/improve this ' + ctx.language + ' code. Only return the fixed code:\n\n```' + ctx.language + '\n' + ctx.selectedText + '\n```'
  this.chat.sendMessage()
}

AnyaApp.prototype.findInFile = function() {
  if (this.editorManager.editor) {
    this.editorManager.editor.focus()
    this.editorManager.editor.getAction('actions.find').run()
  }
}

AnyaApp.prototype.showWelcome = function() {
  var welcome = document.createElement('div')
  welcome.id = 'welcome-overlay'
  welcome.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;z-index:1;pointer-events:none'
  welcome.innerHTML =
    '<div style="font-size:48px;margin-bottom:16px">♥</div>' +
    '<h1 style="color:var(--anya-primary);font-size:24px;font-weight:300;margin-bottom:8px">Welcome to Anya IDE</h1>' +
    '<p style="color:var(--anya-text-muted);font-size:13px;margin-bottom:4px">~ Waku Waku! ~</p>' +
    '<p style="color:var(--anya-text-muted);font-size:12px">Open a folder or file to get started</p>' +
    '<div style="margin-top:24px;display:flex;gap:8px;justify-content:center">' +
      '<span style="background:var(--anya-surface);padding:6px 12px;border-radius:4px;font-size:11px;color:var(--anya-text-muted)">Ctrl+O</span>' +
      '<span style="background:var(--anya-surface);padding:6px 12px;border-radius:4px;font-size:11px;color:var(--anya-text-muted)">Open File</span>' +
    '</div>' +
    '<div style="margin-top:8px;display:flex;gap:8px;justify-content:center">' +
      '<span style="background:var(--anya-surface);padding:6px 12px;border-radius:4px;font-size:11px;color:var(--anya-text-muted)">Ctrl+K</span>' +
      '<span style="background:var(--anya-surface);padding:6px 12px;border-radius:4px;font-size:11px;color:var(--anya-text-muted)">Open Folder</span>' +
    '</div>'
  document.getElementById('editor-area').appendChild(welcome)

  var observer = new MutationObserver(function() {
    if (document.querySelector('.editor-tab')) {
      var w = document.getElementById('welcome-overlay')
      if (w) { w.remove(); observer.disconnect() }
    }
  })
  observer.observe(document.getElementById('editor-tabs'), { childList: true })
}

AnyaApp.prototype.showShortcuts = function() {
  var shortcuts = [
    ['Ctrl+N', 'New File'], ['Ctrl+O', 'Open File'], ['Ctrl+S', 'Save'],
    ['Ctrl+B', 'Toggle Sidebar'], ['Ctrl+`', 'Toggle Terminal'],
    ['Ctrl+Shift+A', 'Toggle AI Chat'], ['Ctrl+Shift+P', 'Command Palette'],
    ['Ctrl+F', 'Find in File'], ['Ctrl+Z', 'Undo'], ['Ctrl+Shift+Z', 'Redo'],
    ['Ctrl+Shift+K', 'Shortcuts'], ['F12', 'Dev Tools']
  ]

  var overlay = document.createElement('div')
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:5000'
  overlay.innerHTML =
    '<div style="background:var(--anya-bg-secondary);border:1px solid var(--anya-border-light);border-radius:8px;padding:24px;width:450px;max-width:90%;max-height:80vh;overflow-y:auto">' +
      '<h3 style="color:var(--anya-primary);margin-bottom:16px;font-size:16px">⌨️ Keyboard Shortcuts</h3>' +
      shortcuts.map(function(s) {
        return '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--anya-border);font-size:12px">' +
          '<span style="color:var(--anya-text-muted)">' + s[1] + '</span>' +
          '<span style="color:var(--anya-primary);font-family:var(--font-mono);font-size:11px">' + s[0] + '</span>' +
        '</div>'
      }).join('') +
      '<div style="margin-top:16px;text-align:right">' +
        '<button id="shortcuts-close" style="padding:8px 16px;background:var(--anya-primary);border:none;border-radius:4px;color:white;cursor:pointer">Close</button>' +
      '</div>' +
    '</div>'

  document.body.appendChild(overlay)
  overlay.querySelector('#shortcuts-close').onclick = function() { overlay.remove() }
  overlay.onclick = function(e) { if (e.target === overlay) overlay.remove() }
}

AnyaApp.prototype.showAbout = function() {
  var overlay = document.createElement('div')
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:5000'
  overlay.innerHTML =
    '<div style="background:var(--anya-bg-secondary);border:1px solid var(--anya-border-light);border-radius:8px;padding:32px;text-align:center;max-width:350px">' +
      '<div style="font-size:48px;margin-bottom:12px">♥</div>' +
      '<h2 style="color:var(--anya-primary);font-size:20px;margin-bottom:4px">Anya IDE</h2>' +
      '<p style="color:var(--anya-text-muted);font-size:12px;margin-bottom:4px">Version 1.0.0</p>' +
      '<p style="color:var(--anya-text-muted);font-size:12px;margin-bottom:16px">~ Waku Waku! ~</p>' +
      '<p style="color:var(--anya-text-secondary);font-size:12px;margin-bottom:20px">Pink AI-powered IDE for Windows</p>' +
      '<p style="color:var(--anya-text-muted);font-size:11px;margin-bottom:16px">Made with ♥ by Anya</p>' +
      '<button id="about-close" style="padding:8px 24px;background:var(--anya-primary);border:none;border-radius:4px;color:white;cursor:pointer">Close</button>' +
    '</div>'

  document.body.appendChild(overlay)
  overlay.querySelector('#about-close').onclick = function() { overlay.remove() }
  overlay.onclick = function(e) { if (e.target === overlay) overlay.remove() }
}

var app = new AnyaApp()
app.initAI()

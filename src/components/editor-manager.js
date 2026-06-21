function EditorManager() {
  this.editor = null
  this.tabs = []
  this.activeTabId = null
  this.nextTabId = 1
  this.container = document.getElementById('editor-container')
  this.tabBar = document.getElementById('editor-tabs')
  this.dirtyStates = {}
  this.monacoReady = false
  this.pendingOpen = null

  this.loadMonaco()
}

EditorManager.prototype.loadMonaco = function() {
  var self = this

  var loader = document.createElement('script')
  loader.src = '../node_modules/monaco-editor/min/vs/loader.js'
  loader.onload = function() {
    require.config({
      paths: { vs: '../node_modules/monaco-editor/min/vs' },
      'vs/nls': { availableLanguages: { '*': '' } }
    })

    require(['vs/editor/editor.main'], function() {
      self.monacoReady = true
      self.createEditor()
      if (self.pendingOpen) {
        self.openFile(self.pendingOpen)
        self.pendingOpen = null
      }
    })
  }
  loader.onerror = function() {
    self.container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--anya-error);font-size:14px;flex-direction:column;gap:8px">' +
      '<div>⚠️ Failed to load Monaco Editor</div>' +
      '<div style="font-size:12px;color:var(--anya-text-muted)">Make sure monaco-editor is installed (npm install)</div>' +
      '</div>'
  }
  document.head.appendChild(loader)

  var cssLink = document.createElement('link')
  cssLink.rel = 'stylesheet'
  cssLink.href = '../node_modules/monaco-editor/min/vs/editor/editor.main.css'
  document.head.appendChild(cssLink)
}

EditorManager.prototype.createEditor = function() {
  var self = this

  monaco.editor.defineTheme('anya-light', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: 'E84393' },
      { token: 'string', foreground: 'FF69B4' },
      { token: 'number', foreground: 'FF9800' },
      { token: 'comment', foreground: '6A6A6A', fontStyle: 'italic' },
      { token: 'type', foreground: 'E84393' },
      { token: 'function', foreground: 'FF69B4' },
      { token: 'variable', foreground: '2d1c28' },
      { token: 'operator', foreground: 'E84393' }
    ],
    colors: {
      'editor.background': '#FFFFFF',
      'editor.foreground': '#2d1c28',
      'editor.lineHighlightBackground': '#FFF0F0',
      'editor.selectionBackground': '#DAA52040',
      'editorCursor.foreground': '#FF69B4',
      'editorLineNumber.foreground': '#d4b8c6',
      'editorLineNumber.activeForeground': '#FF69B4',
      'editor.selectionHighlightBackground': '#DAA5201F',
      'editorIndentGuide.background': '#FF69B41A',
      'editorIndentGuide.activeBackground': '#FF69B42E',
      'editorBracketMatch.background': '#FF69B41F',
      'editorBracketMatch.border': '#FF69B4',
      'editorWidget.background': '#FFF5EE',
      'editorWidget.border': '#F5D5CC',
      'input.background': '#FFFFFF',
      'input.border': '#F5D5CC',
      'input.foreground': '#2d1c28',
      'list.hoverBackground': '#FFEEE6',
      'list.activeSelectionBackground': '#FFE8DE',
      'list.highlightForeground': '#FF69B4',
      'scrollbar.shadow': 'transparent',
      'scrollbarSlider.background': '#FF69B41F',
      'scrollbarSlider.hoverBackground': '#FF69B438',
      'scrollbarSlider.activeBackground': '#FF69B452',
      'minimap.background': '#FFF8F4'
    }
  })

  this.editor = monaco.editor.create(this.container, {
    value: '// Welcome to Anya IDE\n// Open a file or start typing...\n\n',
    language: 'javascript',
    theme: 'anya-light',
    fontSize: 13,
    fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', 'Consolas', monospace",
    lineNumbers: 'on',
    minimap: { enabled: true, size: 'proportional' },
    scrollBeyondLastLine: false,
    automaticLayout: true,
    tabSize: 2,
    insertSpaces: true,
    wordWrap: 'off',
    bracketPairColorization: { enabled: true },
    cursorBlinking: 'smooth',
    cursorSmoothCaretAnimation: 'on',
    smoothScrolling: true,
    padding: { top: 8 },
    folding: true,
    guides: { indentation: true, bracketPairs: true },
    renderLineHighlight: 'gutter',
    occurrencesHighlight: true,
    formatOnPaste: true
  })

  ;(async function() {
    try {
      var cfg = await window.anya.config.read()
      if (cfg) self.applyConfig(cfg)
    } catch(e) {}
  })()

  this.editor.onDidChangeModelContent(function() {
    var tabId = self.activeTabId
    if (tabId) {
      var tab = self.tabs.find(function(t) { return t.id === tabId })
      if (tab && tab.filePath && !self.dirtyStates[tabId]) {
        self.dirtyStates[tabId] = true
        self.updateTabDirty(tabId)
      }
    }
  })
}

EditorManager.prototype.openFile = async function(filePath) {
  if (!this.monacoReady) {
    this.pendingOpen = filePath
    return
  }

  var result = await window.anya.fileSystem.readFile(filePath)
  if (!result.success) return

  var existing = this.tabs.find(function(t) { return t.filePath === filePath })
  if (existing) { this.setActiveTab(existing.id); return }

  var tabId = this.nextTabId++
  var name = AnyaHelpers.getBasename(filePath)
  var language = AnyaHelpers.getLanguageFromPath(filePath)

  this.tabs.push({ id: tabId, filePath: filePath, name: name, language: language, savedContent: result.content })
  this.dirtyStates[tabId] = false
  this.renderTabs()
  this.setActiveTab(tabId)

  if (this.editor) {
    var uri = monaco.Uri.parse('file:///' + filePath.replace(/\\/g, '/'))
    var model = monaco.editor.getModel(uri)
    if (!model) {
      model = monaco.editor.createModel(result.content, language, uri)
    } else {
      model.setValue(result.content)
    }
    this.editor.setModel(model)
    this.editor.focus()
  }
}

EditorManager.prototype.setActiveTab = function(tabId) {
  this.activeTabId = tabId
  this.renderTabs()

  var tab = this.tabs.find(function(t) { return t.id === tabId })
  if (tab && this.editor) {
    var uri = monaco.Uri.parse('file:///' + tab.filePath.replace(/\\/g, '/'))
    var model = monaco.editor.getModel(uri)
    if (!model) {
      model = monaco.editor.createModel(tab.savedContent || '', tab.language, uri)
    }
    this.editor.setModel(model)
    this.editor.focus()
  }
}

EditorManager.prototype.closeTab = function(tabId) {
  var idx = -1
  for (var i = 0; i < this.tabs.length; i++) {
    if (this.tabs[i].id === tabId) { idx = i; break }
  }
  if (idx === -1) return

  var tab = this.tabs[idx]
  if (this.dirtyStates[tabId]) {
    if (!confirm(tab.name + ' has unsaved changes. Close anyway?')) return
  }

  var uri = monaco.Uri.parse('file:///' + tab.filePath.replace(/\\/g, '/'))
  var model = monaco.editor.getModel(uri)
  if (model) model.dispose()

  delete this.dirtyStates[tabId]
  this.tabs.splice(idx, 1)

  if (this.tabs.length === 0) {
    this.activeTabId = null
    if (this.editor) {
      this.editor.setModel(monaco.editor.createModel('', 'plaintext'))
    }
    this.renderTabs()
    return
  }

  var newIdx = Math.min(idx, this.tabs.length - 1)
  this.setActiveTab(this.tabs[newIdx].id)
}

EditorManager.prototype.saveCurrentFile = async function() {
  if (!this.activeTabId) return
  var self = this
  var tab = this.tabs.find(function(t) { return t.id === self.activeTabId })
  if (!tab || !tab.filePath) return

  var content = this.editor ? this.editor.getModel().getValue() : ''
  await window.anya.fileSystem.writeFile(tab.filePath, content)
  tab.savedContent = content
  this.dirtyStates[this.activeTabId] = false
  this.updateTabDirty(this.activeTabId)
  AnyaToast.success('Saved: ' + tab.name)
}

EditorManager.prototype.updateTabDirty = function(tabId) {
  var el = this.tabBar.querySelector('[data-tab-id="' + tabId + '"]')
  if (el) el.classList.toggle('unsaved', this.dirtyStates[tabId])
}

EditorManager.prototype.renderTabs = function() {
  var self = this
  if (this.tabs.length === 0) { this.tabBar.innerHTML = ''; return }

  this.tabBar.innerHTML = this.tabs.map(function(tab) {
    return '<div class="editor-tab' + (tab.id === self.activeTabId ? ' active' : '') + (self.dirtyStates[tab.id] ? ' unsaved' : '') + '" data-tab-id="' + tab.id + '">' +
      '<span class="tab-name">' + AnyaHelpers.escapeHtml(tab.name) + '</span>' +
      '<span class="tab-close" data-tab-id="' + tab.id + '">✕</span>' +
    '</div>'
  }).join('')

  this.tabBar.querySelectorAll('.editor-tab').forEach(function(el) {
    el.onclick = function(e) {
      if (e.target.classList.contains('tab-close')) return
      self.setActiveTab(parseInt(el.dataset.tabId))
    }
  })

  this.tabBar.querySelectorAll('.tab-close').forEach(function(el) {
    el.onclick = function(e) {
      e.stopPropagation()
      self.closeTab(parseInt(el.dataset.tabId))
    }
  })
}

EditorManager.prototype.applyConfig = function(config) {
  if (!this.editor) return
  var opts = {}
  if (config.fontSize) opts.fontSize = parseInt(config.fontSize)
  if (config.fontFamily) opts.fontFamily = config.fontFamily
  if (config.tabSize) opts.tabSize = parseInt(config.tabSize)
  if (config.wordWrap) opts.wordWrap = config.wordWrap
  if (Object.keys(opts).length > 0) this.editor.updateOptions(opts)
}

EditorManager.prototype.getCurrentContent = function() {
  return this.editor ? this.editor.getValue() : ''
}

EditorManager.prototype.getCurrentLanguage = function() {
  var self = this
  var tab = this.tabs.find(function(t) { return t.id === self.activeTabId })
  return tab ? tab.language : 'plaintext'
}

EditorManager.prototype.getSelectedText = function() {
  if (!this.editor) return ''
  var sel = this.editor.getSelection()
  var model = this.editor.getModel()
  return model ? model.getValueInRange(sel) : ''
}

EditorManager.prototype.replaceSelection = function(text) {
  if (this.editor) {
    this.editor.executeEdits('anya-ai', [{ range: this.editor.getSelection(), text: text }])
  }
}

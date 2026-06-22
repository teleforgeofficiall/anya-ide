function Sidebar(onFileSelect) {
  this.onFileSelect = onFileSelect
  this.currentFolder = null
  this.fileTree = []
  this.activeTab = 'files'
  this.expandedDirs = {}
  this.selectedPath = null

  this.initTabs()
  this.initSearch()
  this.initGit()
}

Sidebar.prototype.initTabs = function() {
  var self = this
  document.querySelectorAll('.sidebar-tab').forEach(function(tab) {
    tab.onclick = function() {
      document.querySelectorAll('.sidebar-tab').forEach(function(t) { t.classList.remove('active') })
      tab.classList.add('active')
      self.switchTab(tab.dataset.tab)
    }
  })
}

Sidebar.prototype.switchTab = function(tabName) {
  this.activeTab = tabName
  document.querySelectorAll('.sidebar-panel').forEach(function(p) { p.classList.remove('active') })
  var panel = document.getElementById('sidebar-' + tabName)
  if (panel) panel.classList.add('active')

  if (tabName === 'ai') {
    this.initAI()
  }
}

Sidebar.prototype.loadFolder = async function(folderPath) {
  this.currentFolder = folderPath
  this.expandedDirs = {}
  var result = await window.anya.fileSystem.readDirectory(folderPath)
  if (result.success) {
    this.fileTree = result.items
    this.renderFiles()
  }
}

Sidebar.prototype.renderFiles = function() {
  var container = document.getElementById('sidebar-files')
  if (!this.currentFolder) {
    container.innerHTML = '<div style="padding:12px;color:var(--anya-text-muted);font-size:12px">No folder open. Click 📂 to open a project.</div>'
    return
  }

  var folderName = this.currentFolder.split('\\').pop() || this.currentFolder.split('/').pop()
  var html = '<div class="sidebar-section-header" style="padding:4px 12px">' + AnyaHelpers.escapeHtml(folderName) + '</div>'
  html += this.renderTree(this.fileTree, 0)
  container.innerHTML = html
  this.attachEvents()
}

Sidebar.prototype.renderTree = function(items, depth) {
  var html = ''
  for (var i = 0; i < items.length; i++) {
    var item = items[i]
    if (item.name.startsWith('.') && item.name !== '.gitignore' && item.name !== '.env' && item.name !== '.gitattributes') continue
    if (item.name === 'node_modules' || item.name === '.git') continue

    var indent = depth * 16 + 12
    var icon = AnyaHelpers.getFileIcon(item.name, item.isDirectory)
    var isExpanded = this.expandedDirs[item.path]
    var isSelected = item.path === this.selectedPath

    html += '<div class="file-item' + (item.isDirectory ? ' directory' : '') + (isSelected ? ' selected' : '') + '" data-path="' + AnyaHelpers.escapeHtml(item.path) + '" data-type="' + (item.isDirectory ? 'dir' : 'file') + '" style="padding-left:' + indent + 'px">'
    if (item.isDirectory) {
      html += '<span class="file-icon" style="width:16px;text-align:center;font-size:10px">' + (isExpanded ? '▼' : '▶') + '</span>'
    }
    html += '<span class="file-icon">' + icon + '</span>'
    html += '<span class="file-name">' + AnyaHelpers.escapeHtml(item.name) + '</span>'
    if (!item.isDirectory) {
      html += '<span class="file-actions"><button class="rename-file" title="Rename">✎</button><button class="delete-file" title="Delete">✕</button></span>'
    }
    html += '</div>'

    if (item.isDirectory && isExpanded && item.children) {
      html += this.renderTree(item.children, depth + 1)
    }
  }
  return html
}

Sidebar.prototype.attachEvents = function() {
  var self = this
  var container = document.getElementById('sidebar-files')

  container.querySelectorAll('.file-item[data-type="dir"]').forEach(function(el) {
    el.onclick = async function() {
      var path = el.dataset.path
      if (self.expandedDirs[path]) {
        delete self.expandedDirs[path]
      } else {
        self.expandedDirs[path] = true
        var result = await window.anya.fileSystem.readDirectory(path)
        if (result.success) {
          var parent = self.findInTree(self.fileTree, path)
          if (parent) parent.children = result.items
        }
      }
      self.renderFiles()
    }
  })

  container.querySelectorAll('.file-item[data-type="file"]').forEach(function(el) {
    el.onclick = function() {
      self.selectedPath = el.dataset.path
      container.querySelectorAll('.file-item').forEach(function(f) { f.classList.remove('selected') })
      el.classList.add('selected')
      self.onFileSelect(el.dataset.path)
    }
  })

  container.querySelectorAll('.delete-file').forEach(function(btn) {
    btn.onclick = async function(e) {
      e.stopPropagation()
      var path = btn.closest('.file-item').dataset.path
      if (confirm('Delete this file?')) {
        await window.anya.fileSystem.deleteEntry(path)
        self.refresh()
      }
    }
  })

  container.querySelectorAll('.rename-file').forEach(function(btn) {
    btn.onclick = async function(e) {
      e.stopPropagation()
      var item = btn.closest('.file-item')
      var path = item.dataset.path
      var oldName = item.querySelector('.file-name').textContent
      var newName = prompt('Rename to:', oldName)
      if (newName && newName !== oldName) {
        var dir = path.substring(0, path.length - oldName.length)
        await window.anya.fileSystem.renameEntry(path, dir + newName)
        self.refresh()
      }
    }
  })
}

Sidebar.prototype.findInTree = function(items, targetPath) {
  for (var i = 0; i < items.length; i++) {
    if (items[i].path === targetPath) return items[i]
    if (items[i].children) {
      var found = this.findInTree(items[i].children, targetPath)
      if (found) return found
    }
  }
  return null
}

Sidebar.prototype.refresh = async function() {
  if (this.currentFolder) await this.loadFolder(this.currentFolder)
}

Sidebar.prototype.initSearch = function() {
  var self = this
  var container = document.getElementById('sidebar-search')
  container.innerHTML =
    '<div style="padding:8px">' +
      '<input id="search-input" type="text" placeholder="Search files..." style="width:100%;padding:6px 8px;background:var(--anya-bg);border:1px solid var(--anya-border);border-radius:4px;color:var(--anya-text);outline:none;font-size:12px">' +
      '<div style="display:flex;gap:8px;margin-top:6px;align-items:center">' +
        '<label style="font-size:11px;color:var(--anya-text-muted);display:flex;align-items:center;gap:4px;cursor:pointer">' +
          '<input type="checkbox" id="search-content-toggle" style="accent-color:var(--anya-primary)"> Search file contents' +
        '</label>' +
        '<span id="search-status" style="font-size:11px;color:var(--anya-text-muted);margin-left:auto"></span>' +
      '</div>' +
      '<div id="search-results" style="margin-top:6px;font-size:12px;color:var(--anya-text-muted)"></div>' +
    '</div>'

  var input = document.getElementById('search-input')
  input.oninput = AnyaHelpers.debounce(function() { self.performSearch(input.value) }, 300)
  document.getElementById('search-content-toggle').onchange = function() { self.performSearch(input.value) }
}

Sidebar.prototype.performSearch = async function(query) {
  var self = this
  var results = document.getElementById('search-results')
  var statusEl = document.getElementById('search-status')
  var contentToggle = document.getElementById('search-content-toggle')
  if (!query || !this.currentFolder) { results.innerHTML = ''; if (statusEl) statusEl.textContent = ''; return }

  results.innerHTML = '<div><span class="spinner"></span> Searching...</div>'
  var searchContent = contentToggle ? contentToggle.checked : false
  var matches = await this.searchInDir(this.currentFolder, query.toLowerCase(), searchContent)
  results.innerHTML = ''

  if (matches.length === 0) {
    results.innerHTML = '<div style="color:var(--anya-text-muted);padding:4px 0">No results</div>'
    if (statusEl) statusEl.textContent = ''
    return
  }

  if (statusEl) statusEl.textContent = matches.length + ' result' + (matches.length !== 1 ? 's' : '')

  for (var i = 0; i < Math.min(matches.length, 50); i++) {
    (function(match) {
      var path = match.path || match
      var el = document.createElement('div')
      el.style.cssText = 'padding:3px 0;cursor:pointer;display:flex;align-items:center;gap:6px;font-size:12px'
      var rel = path.replace(self.currentFolder, '').replace(/\\/g, '/').replace(/^\//, '')
      var icon = AnyaHelpers.getFileIcon(path, false)
      var html = icon + ' ' + AnyaHelpers.escapeHtml(rel)
      if (match.line) {
        html += ' <span style="color:var(--anya-primary);font-size:10px">:' + match.line + '</span>'
        html += '<div style="font-size:11px;color:var(--anya-text-muted);padding-left:22px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' +
          AnyaHelpers.escapeHtml(match.preview || '') + '</div>'
      }
      el.innerHTML = html
      el.onclick = function() {
        self.onFileSelect(path)
        if (match.line) {
          setTimeout(function() {
            document.dispatchEvent(new CustomEvent('search-goto-line', { detail: match.line }))
          }, 500)
        }
      }
      el.onmouseenter = function() { el.style.color = 'var(--anya-primary)' }
      el.onmouseleave = function() { el.style.color = '' }
      results.appendChild(el)
    })(matches[i])
  }
}

Sidebar.prototype.searchInDir = async function(dirPath, query, searchContent) {
  var result = await window.anya.fileSystem.readDirectory(dirPath)
  if (!result.success) return []

  var matches = []
  for (var i = 0; i < result.items.length; i++) {
    var item = result.items[i]
    if (item.name.startsWith('.') || item.name === 'node_modules') continue
    if (item.isDirectory) {
      var sub = await this.searchInDir(item.path, query, searchContent)
      matches = matches.concat(sub)
    } else {
      if (item.name.toLowerCase().includes(query)) {
        matches.push({ path: item.path })
      }
      if (searchContent) {
        try {
          var fileResult = await window.anya.fileSystem.readFile(item.path)
          if (fileResult.success) {
            var lines = fileResult.content.split('\n')
            for (var j = 0; j < lines.length; j++) {
              if (lines[j].toLowerCase().includes(query)) {
                var preview = lines[j].trim().substring(0, 100)
                matches.push({ path: item.path, line: j + 1, preview: preview })
                if (matches.length >= 200) break
              }
            }
          }
        } catch(e) {}
      }
    }
    if (matches.length >= 200) break
  }
  return matches
}

Sidebar.prototype.initGit = function() {
  this.gitFiles = []
  this.gitBranch = 'main'
  this.gitBranches = []
  this.gitLog = []
  this.gitCommitting = false
  this.renderGit()
}

Sidebar.prototype.initAI = function() {
  var self = this
  var container = document.getElementById('sidebar-ai')
  container.innerHTML =
    '<div style="display:flex;flex-direction:column;height:100%;padding:8px">' +
      // Header
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-shrink:0">' +
        '<div style="flex:1;font-size:12px;color:var(--anya-text);font-weight:600">🤖 AI Assistant</div>' +
        '<div style="display:flex;gap:4px">' +
          '<button id="ai-new-chat" style="background:var(--anya-primary);border:none;color:white;padding:4px 8px;border-radius:4px;font-size:11px;cursor:pointer">+ New Chat</button>' +
          '<button id="ai-settings" style="background:var(--anya-surface);border:1px solid var(--anya-border);color:var(--anya-text);padding:4px 8px;border-radius:4px;font-size:11px;cursor:pointer">⚙️</button>' +
        '</div>' +
      '</div>' +

      // Current provider/model info (clickable)
      '<div id="ai-provider-info" style="margin-bottom:10px;padding:6px 8px;background:var(--anya-bg);border:1px solid var(--anya-border);border-radius:6px;cursor:pointer;transition:border-color 0.12s;flex-shrink:0" title="Click to change provider/model">' +
        '<div style="font-size:10px;color:var(--anya-text-muted);margin-bottom:2px">Provider</div>' +
        '<div id="ai-provider-label" style="font-size:11px;color:var(--anya-text);font-weight:500">—</div>' +
        '<div style="font-size:10px;color:var(--anya-text-muted);margin-top:3px;margin-bottom:1px">Model</div>' +
        '<div id="ai-model-label" style="font-size:11px;color:var(--anya-text);font-weight:500">—</div>' +
      '</div>' +

      // Quick Actions
      '<div style="margin-bottom:8px;flex-shrink:0">' +
        '<div style="font-size:11px;color:var(--anya-text-muted);margin-bottom:6px;font-weight:600">⚡ Quick Actions</div>' +
        '<div style="display:flex;flex-wrap:wrap;gap:4px">' +
          '<button class="ai-quick-btn" data-action="explain" style="padding:6px 10px;background:var(--anya-surface);border:1px solid var(--anya-border);border-radius:6px;font-size:10px;cursor:pointer;transition:all 0.12s;display:flex;align-items:center;gap:4px;flex:1;min-width:80px;color:var(--anya-text)">💡 Explain</button>' +
          '<button class="ai-quick-btn" data-action="fix" style="padding:6px 10px;background:var(--anya-surface);border:1px solid var(--anya-border);border-radius:6px;font-size:10px;cursor:pointer;transition:all 0.12s;display:flex;align-items:center;gap:4px;flex:1;min-width:80px;color:var(--anya-text)">🔧 Fix Code</button>' +
          '<button class="ai-quick-btn" data-action="test" style="padding:6px 10px;background:var(--anya-surface);border:1px solid var(--anya-border);border-radius:6px;font-size:10px;cursor:pointer;transition:all 0.12s;display:flex;align-items:center;gap:4px;flex:1;min-width:80px;color:var(--anya-text)">🧪 Tests</button>' +
          '<button class="ai-quick-btn" data-action="optimize" style="padding:6px 10px;background:var(--anya-surface);border:1px solid var(--anya-border);border-radius:6px;font-size:10px;cursor:pointer;transition:all 0.12s;display:flex;align-items:center;gap:4px;flex:1;min-width:80px;color:var(--anya-text)">⚡ Optimize</button>' +
          '<button class="ai-quick-btn" data-action="document" style="padding:6px 10px;background:var(--anya-surface);border:1px solid var(--anya-border);border-radius:6px;font-size:10px;cursor:pointer;transition:all 0.12s;display:flex;align-items:center;gap:4px;flex:1;min-width:80px;color:var(--anya-text)">📝 Document</button>' +
        '</div>' +
      '</div>' +

      // Spacer to push quick ask to bottom
      '<div style="flex:1;min-height:8px"></div>' +

      // Quick Ask
      '<div style="flex-shrink:0;border-top:1px solid var(--anya-border);padding-top:8px;margin-top:4px">' +
        '<div style="font-size:11px;color:var(--anya-text-muted);margin-bottom:6px;font-weight:600">💬 Quick Ask</div>' +
        '<div style="display:flex;gap:4px">' +
          '<input id="ai-quick-ask-input" type="text" placeholder="Ask anything..." style="flex:1;padding:6px 8px;background:var(--anya-bg);border:1px solid var(--anya-border);border-radius:6px;color:var(--anya-text);font-size:11px;outline:none;font-family:inherit" />' +
          '<button id="ai-quick-ask-send" style="padding:6px 10px;background:var(--anya-primary);border:none;color:white;border-radius:6px;font-size:11px;cursor:pointer;flex-shrink:0">Send</button>' +
        '</div>' +
      '</div>' +
    '</div>'

  // Wire events
  document.getElementById('ai-new-chat').onclick = function() { self.newAIChat() }
  document.getElementById('ai-settings').onclick = function() { self.showAIModelSettings() }

  document.getElementById('ai-provider-info').onclick = function() { self.showAIModelSettings() }

  document.querySelectorAll('.ai-quick-btn').forEach(function(btn) {
    btn.onclick = function() {
      var action = btn.dataset.action
      self._handleQuickAction(action)
    }
  })

  var quickInput = document.getElementById('ai-quick-ask-input')
  var quickSend = document.getElementById('ai-quick-ask-send')

  quickSend.onclick = function() {
    self._sendQuickAsk()
  }
  quickInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      e.preventDefault()
      self._sendQuickAsk()
    }
  })

  // Load provider info
  this._updateAIProviderInfo()
}

Sidebar.prototype._updateAIProviderInfo = function() {
  var self = this
  ;(async function() {
    try {
      var result = await window.anya.config.read()
      if (result.success && result.config && result.config.aiProvider) {
        var cfg = result.config.aiProvider
        var providerLabel = document.getElementById('ai-provider-label')
        var modelLabel = document.getElementById('ai-model-label')
        if (providerLabel) providerLabel.textContent = AnyaHelpers.escapeHtml(cfg.provider || 'Not configured')
        if (modelLabel) modelLabel.textContent = AnyaHelpers.escapeHtml(cfg.model || 'None')
      }
    } catch(e) {}
  })()
}

Sidebar.prototype._handleQuickAction = function(action) {
  if (!window.app || !window.app.chat) return
  var chat = window.app.chat
  var context = ''
  var editor = window.app.editorManager
  if (editor) {
    var selected = editor.getSelectedText ? editor.getSelectedText() : ''
    if (selected) context = '\n\n```\n' + selected + '\n```'
  }

  var prompts = {
    'explain': 'Explain the following code' + (context ? context : ' in the current file') + '. Describe what it does, its purpose, and any potential issues.',
    'fix': 'Review the following code for bugs, issues, and anti-patterns' + context + '. Provide a fixed version with explanations.',
    'test': 'Generate comprehensive tests for the following code' + context + '. Use the appropriate testing framework (Jest/Mocha/etc). Include edge cases.',
    'optimize': 'Analyze and optimize the following code for performance and readability' + context + '. Suggest specific improvements and show the optimized version.',
    'document': 'Add comprehensive documentation and comments to the following code' + context + '. Include JSDoc/TSDoc style comments.'
  }

  chat.show()
  chat.inputEl.value = prompts[action] || ''
  chat.sendMessage()
}

Sidebar.prototype._sendQuickAsk = function() {
  var input = document.getElementById('ai-quick-ask-input')
  if (!input || !input.value.trim()) return
  if (!window.app || !window.app.chat) return
  var chat = window.app.chat
  chat.show()
  chat.inputEl.value = input.value
  chat.sendMessage()
  input.value = ''
}

Sidebar.prototype.newAIChat = function() {
  if (window.app && window.app.chat) {
    window.app.chat.newSession()
    window.app.chat.show()
  }
}

Sidebar.prototype.showAIModelSettings = function() {
  if (window.app && window.app.settings) {
    window.app.settings.toggle('ai-provider')
  }
}

Sidebar.prototype.renderGit = function() {
  var container = document.getElementById('sidebar-git')
  container.innerHTML =
    '<div class="git-section">' +
      '<div id="git-branch-selector" class="git-branch-selector">' +
        '<span>🌿</span>' +
        '<span id="git-current-branch">' + AnyaHelpers.escapeHtml(this.gitBranch || 'no repo') + '</span>' +
      '</div>' +
      '<div id="git-files-list"></div>' +
    '</div>' +
    '<div id="git-commit-area" class="git-commit-area">' +
      '<input id="git-commit-message" class="git-commit-input" type="text" placeholder="Commit message..." />' +
      '<div class="git-actions">' +
        '<button id="git-btn-commit" class="git-btn git-btn-primary" disabled>Commit</button>' +
        '<button id="git-btn-push" class="git-btn git-btn-outline" title="Push">↑ Push</button>' +
        '<button id="git-btn-pull" class="git-btn git-btn-outline" title="Pull">↓ Pull</button>' +
        '<button id="git-btn-refresh" class="git-btn git-btn-outline" title="Refresh">↻</button>' +
      '</div>' +
    '</div>'

  var self = this

  document.getElementById('git-branch-selector').onclick = function() {
    self.showBranchMenu()
  }

  var commitInput = document.getElementById('git-commit-message')
  var commitBtn = document.getElementById('git-btn-commit')

  commitInput.oninput = function() {
    commitBtn.disabled = !commitInput.value.trim()
  }

  commitBtn.onclick = function() { self.doCommit() }
  document.getElementById('git-btn-push').onclick = function() { self.doPush() }
  document.getElementById('git-btn-pull').onclick = function() { self.doPull() }
  document.getElementById('git-btn-refresh').onclick = function() { self.refreshGit() }

  if (this.currentFolder) {
    this.loadGitStatus()
  } else {
    document.getElementById('git-files-list').innerHTML = '<div style="padding:12px;color:var(--anya-text-muted);font-size:12px;text-align:center">Open a folder to see git status</div>'
  }
}

Sidebar.prototype.loadGitStatus = async function() {
  var self = this
  var filesList = document.getElementById('git-files-list')
  if (!filesList) return

  var isRepo = await window.anya.git.isRepo(this.currentFolder)
  if (!isRepo) {
    filesList.innerHTML =
      '<div style="padding:12px;color:var(--anya-text-muted);font-size:12px;text-align:center">' +
        '<div style="font-size:20px;margin-bottom:6px">🔀</div>' +
        '<div>Not a git repository</div>' +
        '<button id="git-init-btn" class="git-btn git-btn-primary" style="margin-top:8px">Initialize Repo</button>' +
      '</div>'
    document.getElementById('git-current-branch').textContent = 'no repo'
    var initBtn = document.getElementById('git-init-btn')
    if (initBtn) {
      initBtn.onclick = async function() {
        await window.anya.git.init(self.currentFolder)
        self.refreshGit()
        AnyaToast.success('Git repository initialized')
      }
    }
    return
  }

  var result = await window.anya.git.status(this.currentFolder)
  if (!result.success) {
    filesList.innerHTML = '<div style="padding:12px;color:var(--anya-error);font-size:12px">Git error: ' + AnyaHelpers.escapeHtml(result.error || '') + '</div>'
    return
  }

  this.gitFiles = result.files || []
  this.gitBranch = result.branch || 'unknown'
  document.getElementById('git-current-branch').textContent = this.gitBranch

  var branchResult = await window.anya.git.branchList(this.currentFolder)
  if (branchResult.success) {
    this.gitBranches = branchResult.branches || []
  }

  var logResult = await window.anya.git.log(this.currentFolder)
  if (logResult.success) {
    this.gitLog = logResult.entries || []
  }

  this.renderGitFiles()
}

Sidebar.prototype.renderGitFiles = function() {
  var filesList = document.getElementById('git-files-list')
  if (!filesList) return

  if (this.gitFiles.length === 0) {
    filesList.innerHTML = '<div style="padding:12px;color:var(--anya-text-muted);font-size:12px;text-align:center">No changes detected</div>'
    document.getElementById('git-btn-commit').disabled = true
    return
  }

  var stagedCount = this.gitFiles.filter(function(f) { return f.x !== ' ' && f.x !== '?' }).length
  var unstagedCount = this.gitFiles.length - stagedCount

  var html = ''
  if (stagedCount > 0) {
    html += '<div class="sidebar-section-header" style="padding:4px 12px">Staged Changes (' + stagedCount + ')</div>'
    for (var i = 0; i < this.gitFiles.length; i++) {
      var f = this.gitFiles[i]
      if (f.x === ' ' || f.x === '?') continue
      html += '<div class="git-file-item" data-path="' + AnyaHelpers.escapeHtml(f.path) + '">' +
        '<span class="git-status-icon git-status-' + f.x + '">' + f.x + '</span>' +
        '<span class="file-name">' + AnyaHelpers.escapeHtml(f.path) + '</span>' +
        '<span class="file-actions"><button class="git-unstage-btn" title="Unstage">−</button></span>' +
      '</div>'
    }
  }

  if (unstagedCount > 0) {
    html += '<div class="sidebar-section-header" style="padding:4px 12px">Changes (' + unstagedCount + ')</div>'
    for (var i = 0; i < this.gitFiles.length; i++) {
      var f = this.gitFiles[i]
      if (f.x === ' ' && f.y === ' ') continue
      if (f.x !== ' ' && f.x !== '?') continue
      var status = f.x === '?' ? 'U' : f.y || f.x
      html += '<div class="git-file-item" data-path="' + AnyaHelpers.escapeHtml(f.path) + '">' +
        '<span class="git-status-icon git-status-' + status + '">' + (f.x === '?' ? 'U' : f.y || f.x) + '</span>' +
        '<span class="file-name">' + AnyaHelpers.escapeHtml(f.path) + '</span>' +
        '<span class="file-actions"><button class="git-stage-btn" title="Stage">+</button></span>' +
      '</div>'
    }
  }

  filesList.innerHTML = html

  var self = this
  filesList.querySelectorAll('.git-file-item').forEach(function(el) {
    el.onclick = function() {
      self.onFileSelect(self.currentFolder + '\\' + el.dataset.path)
    }
  })

  filesList.querySelectorAll('.git-stage-btn').forEach(function(btn) {
    btn.onclick = function(e) {
      e.stopPropagation()
      var path = btn.closest('.git-file-item').dataset.path
      self.stageFile(path)
    }
  })

  filesList.querySelectorAll('.git-unstage-btn').forEach(function(btn) {
    btn.onclick = function(e) {
      e.stopPropagation()
      var path = btn.closest('.git-file-item').dataset.path
      self.unstageFile(path)
    }
  })

  document.getElementById('git-btn-commit').disabled = stagedCount === 0
}

Sidebar.prototype.stageFile = async function(path) {
  await window.anya.git.stage(this.currentFolder, path)
  AnyaToast.info('Staged: ' + path)
  this.loadGitStatus()
}

Sidebar.prototype.unstageFile = async function(path) {
  await window.anya.git.unstage(this.currentFolder, path)
  AnyaToast.info('Unstaged: ' + path)
  this.loadGitStatus()
}

Sidebar.prototype.doCommit = async function() {
  var input = document.getElementById('git-commit-message')
  var msg = input.value.trim()
  if (!msg) return

  var btn = document.getElementById('git-btn-commit')
  btn.disabled = true
  btn.textContent = '...'

  var result = await window.anya.git.commit(this.currentFolder, msg)
  if (result.success) {
    AnyaToast.success('Committed: ' + msg.split('\n')[0])
    input.value = ''
    document.getElementById('git-btn-commit').disabled = true
  } else {
    AnyaToast.error('Commit failed: ' + (result.error || 'unknown'))
  }

  btn.textContent = 'Commit'
  this.loadGitStatus()
}

Sidebar.prototype.doPush = async function() {
  var btn = document.getElementById('git-btn-push')
  btn.disabled = true
  btn.textContent = '...'
  var result = await window.anya.git.push(this.currentFolder)
  btn.disabled = false
  btn.innerHTML = '↑ Push'
  if (result.success) {
    AnyaToast.success('Pushed successfully')
  } else {
    AnyaToast.error('Push failed: ' + (result.error || 'unknown'))
  }
}

Sidebar.prototype.doPull = async function() {
  var btn = document.getElementById('git-btn-pull')
  btn.disabled = true
  btn.textContent = '...'
  var result = await window.anya.git.pull(this.currentFolder)
  btn.disabled = false
  btn.innerHTML = '↓ Pull'
  if (result.success) {
    AnyaToast.success('Pulled successfully')
  } else {
    AnyaToast.error('Pull failed: ' + (result.error || 'unknown'))
  }
}

Sidebar.prototype.refreshGit = function() {
  this.loadGitStatus()
}

Sidebar.prototype.showBranchMenu = function() {
  var self = this
  var selector = document.getElementById('git-branch-selector')
  var existing = document.querySelector('.git-branch-menu')
  if (existing) { existing.remove(); return }

  var menu = document.createElement('div')
  menu.className = 'git-branch-menu'
  menu.style.cssText = 'position:fixed;background:white;border:1px solid var(--anya-border);border-radius:6px;padding:4px 0;min-width:180px;box-shadow:0 4px 12px rgba(0,0,0,0.1);z-index:3000;max-height:300px;overflow-y:auto'

  var rect = selector.getBoundingClientRect()
  menu.style.left = rect.left + 'px'
  menu.style.top = (rect.bottom + 4) + 'px'

  for (var i = 0; i < this.gitBranches.length; i++) {
    var b = this.gitBranches[i]
    var el = document.createElement('div')
    el.style.cssText = 'padding:5px 14px;cursor:pointer;font-size:12px;display:flex;align-items:center;gap:6px;color:var(--anya-text)' +
      (b.current ? ';background:var(--anya-surface);font-weight:600' : '')
    el.innerHTML = (b.current ? '🌿 ' : '      ') + AnyaHelpers.escapeHtml(b.name)
    el.onmouseenter = function() { this.style.background = 'var(--anya-surface)' }
    el.onmouseleave = function() { this.style.background = '' }
    el.onclick = (function(branchName) {
      return async function() {
        menu.remove()
        if (branchName !== self.gitBranch) {
          await window.anya.git.checkout(self.currentFolder, branchName)
          self.refreshGit()
        }
      }
    })(b.name)
    menu.appendChild(el)
  }

  document.body.appendChild(menu)
  setTimeout(function() {
    document.addEventListener('click', function closeMenu(e) {
      if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', closeMenu) }
    })
  }, 0)
}

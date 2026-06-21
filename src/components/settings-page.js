function SettingsPage() {
  this.isVisible = false
  this.activeTab = 'providers'
  this.config = {}
  this.aiProviderService = null

  this.tabs = [
    { id: 'providers', label: 'AI Providers', icon: '🔑' },
    { id: 'models', label: 'Models', icon: '🧠' },
    { id: 'prompt', label: 'Custom Prompt', icon: '✏️' },
    { id: 'appearance', label: 'Appearance', icon: '🎨' },
    { id: 'workspace', label: 'Workspace', icon: '📁' },
    { id: 'update', label: 'Update', icon: '📦' },
    { id: 'git', label: 'Git', icon: '🔀' },
    { id: 'github', label: 'GitHub', icon: '🐙' },
    { id: 'memory', label: 'Memory', icon: '💾' }
  ]

  this.render()
}

SettingsPage.prototype.render = function() {
  var el = document.createElement('div')
  el.id = 'settings-page'
  el.className = 'hidden'
  document.body.appendChild(el)
  this.el = el
}

SettingsPage.prototype.open = function(aiProviderService) {
  this.aiProviderService = aiProviderService
  this.loadConfig()
}

SettingsPage.prototype.loadConfig = async function() {
  var self = this
  var result = await window.anya.config.read()
  if (result.success) {
    this.config = result.config || {}
    if (!this.config.aiProvider) this.config.aiProvider = {}
    if (!this.config.prompt) this.config.prompt = 'You are Anya, a helpful AI coding assistant. Be concise. Use markdown.'
    if (!this.config.workspace) this.config.workspace = { autoSave: false, formatOnSave: false, tabSize: 2 }
    if (!this.config.appearance) this.config.appearance = { fontSize: 13, theme: 'light', primaryColor: '#FF69B4', bgColor: '#FFF5EE', textColor: '#2d1c28' }
    if (!this.config.git) this.config.git = { defaultBranch: 'main', autoFetch: false }
    if (!this.config.github) this.config.github = { token: '' }
    if (!this.config.memory) this.config.memory = { contextWindow: 50, saveConversations: true }
  } else {
    this.config = {
      aiProvider: {},
      prompt: 'You are Anya, a helpful AI coding assistant. Be concise. Use markdown.',
      workspace: { autoSave: false, formatOnSave: false, tabSize: 2 },
      appearance: { fontSize: 13, theme: 'light' },
      git: { defaultBranch: 'main', autoFetch: false },
      github: { token: '' },
      memory: { contextWindow: 50, saveConversations: true }
    }
  }
  self.renderSettings()
}

SettingsPage.prototype.renderSettings = function() {
  var self = this
  var providers = this.aiProviderService ? this.aiProviderService.providers : {}
  var currentProvider = this.config.aiProvider.provider || ''

  var tabHtml = this.tabs.map(function(t) {
    return '<button class="settings-tab' + (t.id === self.activeTab ? ' active' : '') + '" data-tab="' + t.id + '">' +
      '<span class="settings-tab-icon">' + t.icon + '</span>' +
      '<span class="settings-tab-label">' + t.label + '</span>' +
    '</button>'
  }).join('')

  this.el.innerHTML =
    '<div class="settings-overlay">' +
      '<div class="settings-window">' +
        '<div class="settings-header">' +
          '<h2 class="settings-title">♥ Settings</h2>' +
          '<button class="settings-close" title="Close">✕</button>' +
        '</div>' +
        '<div class="settings-body">' +
          '<div class="settings-tabs">' +
            tabHtml +
            '<div class="settings-tab-spacer"></div>' +
          '</div>' +
          '<div class="settings-content">' +
            this.renderTabContent() +
          '</div>' +
        '</div>' +
        '<div class="settings-footer">' +
          '<button id="settings-cancel" class="settings-btn settings-btn-outline">Cancel</button>' +
          '<button id="settings-save" class="settings-btn settings-btn-primary">Save Settings</button>' +
        '</div>' +
      '</div>' +
    '</div>'

  this.el.classList.remove('hidden')
  this.isVisible = true

  this.el.querySelector('.settings-close').onclick = function() { self.close() }

  this.el.querySelectorAll('.settings-tab').forEach(function(btn) {
    btn.onclick = function() {
      self.activeTab = btn.dataset.tab
      self.renderSettings()
    }
  })

  document.getElementById('settings-cancel').onclick = function() { self.close() }
  document.getElementById('settings-save').onclick = function() { self.saveConfig() }

  this.attachTabEvents()
}

SettingsPage.prototype.renderTabContent = function() {
  var self = this
  switch (this.activeTab) {
    case 'providers': return this.renderProvidersTab()
    case 'models': return this.renderModelsTab()
    case 'prompt': return this.renderPromptTab()
    case 'appearance': return this.renderAppearanceTab()
    case 'update': return this.renderUpdateTab()
    case 'workspace': return this.renderWorkspaceTab()
    case 'git': return this.renderGitTab()
    case 'github': return this.renderGitHubTab()
    case 'memory': return this.renderMemoryTab()
    default: return '<div>Unknown tab</div>'
  }
}

SettingsPage.prototype.renderProvidersTab = function() {
  var self = this
  var providers = this.aiProviderService ? this.aiProviderService.providers : {}
  var currentProvider = this.config.aiProvider.provider || ''
  var providerOptions = '<option value="">-- Select Provider --</option>'
  for (var id in providers) {
    if (providers.hasOwnProperty(id)) {
      providerOptions += '<option value="' + id + '"' + (id === currentProvider ? ' selected' : '') + '>' +
        providers[id].name + '</option>'
    }
  }

  return '<div class="settings-tab-content active">' +
    '<h3 class="settings-section-title">AI Providers</h3>' +
    '<p class="settings-section-desc">Configure your AI provider to enable the AI chat assistant.</p>' +

    '<div class="settings-field">' +
      '<label class="settings-label">Provider</label>' +
      '<select id="settings-provider" class="settings-select">' + providerOptions + '</select>' +
    '</div>' +

    '<div class="settings-field" id="settings-key-field">' +
      '<label class="settings-label">API Key</label>' +
      '<input id="settings-api-key" class="settings-input" type="password" placeholder="sk-..." value="' +
        AnyaHelpers.escapeHtml(this.config.aiProvider.apiKey || '') + '" />' +
    '</div>' +

    '<div class="settings-field">' +
      '<label class="settings-label">Model</label>' +
      '<select id="settings-model" class="settings-select"></select>' +
    '</div>' +

    '<div class="settings-field">' +
      '<button id="settings-test-connection" class="settings-btn settings-btn-outline">Test Connection</button>' +
      '<span id="settings-test-result" style="margin-left:8px;font-size:12px"></span>' +
    '</div>' +
  '</div>'
}

SettingsPage.prototype.renderModelsTab = function() {
  return '<div class="settings-tab-content active">' +
    '<h3 class="settings-section-title">Models</h3>' +
    '<p class="settings-section-desc">Manage AI model settings and defaults.</p>' +
    '<div class="settings-field">' +
      '<label class="settings-label">Default Model</label>' +
      '<input id="settings-default-model" class="settings-input" type="text" placeholder="e.g. gpt-4o" value="' +
        AnyaHelpers.escapeHtml((this.config.aiProvider && this.config.aiProvider.model) || '') + '" />' +
    '</div>' +
    '<div class="settings-field">' +
      '<label class="settings-label">Temperature</label>' +
      '<input id="settings-temperature" class="settings-input" type="number" step="0.1" min="0" max="2" value="' +
        (this.config.aiProvider.temperature || 0.7) + '" style="width:80px" />' +
    '</div>' +
    '<div class="settings-field">' +
      '<label class="settings-label">Max Tokens</label>' +
      '<input id="settings-max-tokens" class="settings-input" type="number" min="1" max="131072" value="' +
        (this.config.aiProvider.maxTokens || 4096) + '" style="width:100px" />' +
    '</div>' +
  '</div>'
}

SettingsPage.prototype.renderPromptTab = function() {
  return '<div class="settings-tab-content active">' +
    '<h3 class="settings-section-title">Custom Prompt</h3>' +
    '<p class="settings-section-desc">Set a custom system prompt for the AI assistant. This instructs how the AI behaves.</p>' +
    '<div class="settings-field">' +
      '<textarea id="settings-prompt" class="settings-textarea" rows="10" placeholder="Enter your custom system prompt...">' +
        AnyaHelpers.escapeHtml(this.config.prompt || '') +
      '</textarea>' +
    '</div>' +
  '</div>'
}

SettingsPage.prototype.renderAppearanceTab = function() {
  return '<div class="settings-tab-content active">' +
    '<h3 class="settings-section-title">Appearance</h3>' +
    '<p class="settings-section-desc">Customize the look and feel of Anya IDE.</p>' +
    '<div class="settings-field">' +
      '<label class="settings-label">Theme</label>' +
      '<select id="settings-theme" class="settings-select">' +
        '<option value="light"' + (this.config.appearance.theme === 'light' ? ' selected' : '') + '>Light Pink (Default)</option>' +
        '<option value="dark"' + (this.config.appearance.theme === 'dark' ? ' selected' : '') + '>Dark</option>' +
      '</select>' +
    '</div>' +
    '<div class="settings-field">' +
      '<label class="settings-label">Font Size</label>' +
      '<input id="settings-font-size" class="settings-input" type="number" min="10" max="24" value="' +
        (this.config.appearance.fontSize || 13) + '" style="width:70px" /> px' +
    '</div>' +
    '<div class="settings-field">' +
      '<label class="settings-label">Font Family</label>' +
      '<select id="settings-font-family" class="settings-select">' +
        '<option value="\'Cascadia Code\', \'Fira Code\', monospace"' + (this.config.appearance.fontFamily === "'Cascadia Code', 'Fira Code', monospace" ? ' selected' : '') + '>Cascadia Code</option>' +
        '<option value="\'Fira Code\', monospace"' + (this.config.appearance.fontFamily === "'Fira Code', monospace" ? ' selected' : '') + '>Fira Code</option>' +
        '<option value="\'JetBrains Mono\', monospace"' + (this.config.appearance.fontFamily === "'JetBrains Mono', monospace" ? ' selected' : '') + '>JetBrains Mono</option>' +
        '<option value="\'Consolas\', monospace"' + (this.config.appearance.fontFamily === "'Consolas', monospace" ? ' selected' : '') + '>Consolas</option>' +
      '</select>' +
    '</div>' +
    '<h3 class="settings-section-title" style="margin-top:20px">Theme Colors</h3>' +
    '<p class="settings-section-desc">Customize the pink theme colors.</p>' +
    '<div class="settings-field">' +
      '<label class="settings-label">Primary Color</label>' +
      '<div class="settings-color-row">' +
        '<input id="settings-color-primary" type="color" class="settings-color-picker" value="' + (this.config.appearance.primaryColor || '#FF69B4') + '" />' +
        '<input id="settings-color-primary-text" class="settings-input" type="text" value="' + (this.config.appearance.primaryColor || '#FF69B4') + '" style="width:100px;font-family:monospace" />' +
      '</div>' +
    '</div>' +
    '<div class="settings-field">' +
      '<label class="settings-label">Background</label>' +
      '<div class="settings-color-row">' +
        '<input id="settings-color-bg" type="color" class="settings-color-picker" value="' + (this.config.appearance.bgColor || '#FFF5EE') + '" />' +
        '<input id="settings-color-bg-text" class="settings-input" type="text" value="' + (this.config.appearance.bgColor || '#FFF5EE') + '" style="width:100px;font-family:monospace" />' +
      '</div>' +
    '</div>' +
    '<div class="settings-field">' +
      '<label class="settings-label">Text Color</label>' +
      '<div class="settings-color-row">' +
        '<input id="settings-color-text" type="color" class="settings-color-picker" value="' + (this.config.appearance.textColor || '#2d1c28') + '" />' +
        '<input id="settings-color-text-text" class="settings-input" type="text" value="' + (this.config.appearance.textColor || '#2d1c28') + '" style="width:100px;font-family:monospace" />' +
      '</div>' +
    '</div>' +
  '</div>'
}

SettingsPage.prototype.renderUpdateTab = function() {
  return '<div class="settings-tab-content active">' +
    '<h3 class="settings-section-title">Update</h3>' +
    '<p class="settings-section-desc">Check for and install new versions of Anya IDE.</p>' +
    '<div class="settings-field">' +
      '<label class="settings-label">Current Version</label>' +
      '<span style="font-size:15px;font-weight:600;color:var(--anya-primary)">v1.0.2</span>' +
    '</div>' +
    '<div class="settings-field" style="margin-top:16px">' +
      '<button id="settings-check-update" class="settings-btn settings-btn-primary">Check for Updates</button>' +
      '<span id="settings-update-status" style="margin-left:12px;font-size:12px"></span>' +
    '</div>' +
    '<div id="settings-update-progress" class="hidden" style="margin-top:12px">' +
      '<div class="update-progress-bar" style="margin-bottom:4px">' +
        '<div class="update-progress-fill" id="settings-update-fill" style="width:0%"></div>' +
      '</div>' +
      '<span class="update-progress-text" id="settings-update-text">Downloading...</span>' +
    '</div>' +
  '</div>'
}

SettingsPage.prototype.renderWorkspaceTab = function() {
  var ws = this.config.workspace || {}
  return '<div class="settings-tab-content active">' +
    '<h3 class="settings-section-title">Workspace</h3>' +
    '<p class="settings-section-desc">Configure editor behavior and workspace preferences.</p>' +
    '<div class="settings-field">' +
      '<label class="settings-checkbox">' +
        '<input type="checkbox" id="settings-autosave"' + (ws.autoSave ? ' checked' : '') + ' />' +
        '<span>Auto Save</span>' +
      '</label>' +
    '</div>' +
    '<div class="settings-field">' +
      '<label class="settings-checkbox">' +
        '<input type="checkbox" id="settings-format-onsave"' + (ws.formatOnSave ? ' checked' : '') + ' />' +
        '<span>Format on Save</span>' +
      '</label>' +
    '</div>' +
    '<div class="settings-field">' +
      '<label class="settings-label">Tab Size</label>' +
      '<select id="settings-tab-size" class="settings-select">' +
        '<option value="2"' + (ws.tabSize === 2 ? ' selected' : '') + '>2 spaces</option>' +
        '<option value="4"' + (ws.tabSize === 4 ? ' selected' : '') + '>4 spaces</option>' +
        '<option value="8"' + (ws.tabSize === 8 ? ' selected' : '') + '>8 spaces</option>' +
      '</select>' +
    '</div>' +
    '<div class="settings-field">' +
      '<label class="settings-checkbox">' +
        '<input type="checkbox" id="settings-wordwrap"' + (ws.wordWrap ? ' checked' : '') + ' />' +
        '<span>Word Wrap</span>' +
      '</label>' +
    '</div>' +
  '</div>'
}

SettingsPage.prototype.renderGitTab = function() {
  var g = this.config.git || {}
  return '<div class="settings-tab-content active">' +
    '<h3 class="settings-section-title">Git</h3>' +
    '<p class="settings-section-desc">Configure Git integration settings.</p>' +
    '<div class="settings-field">' +
      '<label class="settings-label">Default Branch</label>' +
      '<input id="settings-git-default-branch" class="settings-input" type="text" value="' +
        AnyaHelpers.escapeHtml(g.defaultBranch || 'main') + '" placeholder="main" />' +
    '</div>' +
    '<div class="settings-field">' +
      '<label class="settings-checkbox">' +
        '<input type="checkbox" id="settings-git-autofetch"' + (g.autoFetch ? ' checked' : '') + ' />' +
        '<span>Auto Fetch</span>' +
      '</label>' +
    '</div>' +
    '<div class="settings-field">' +
      '<p style="font-size:12px;color:var(--anya-text-muted);margin-top:16px">' +
        'Git commands use the git executable from your system PATH.' +
      '</p>' +
    '</div>' +
  '</div>'
}

SettingsPage.prototype.renderGitHubTab = function() {
  var gh = this.config.github || {}
  return '<div class="settings-tab-content active">' +
    '<h3 class="settings-section-title">GitHub</h3>' +
    '<p class="settings-section-desc">Connect to GitHub for repository management, PRs, and issues.</p>' +
    '<div class="settings-field">' +
      '<label class="settings-label">GitHub Token</label>' +
      '<input id="settings-github-token" class="settings-input" type="password" placeholder="ghp_..." value="' +
        AnyaHelpers.escapeHtml(gh.token || '') + '" />' +
    '</div>' +
    '<div class="settings-field">' +
      '<label class="settings-label">GitHub Username</label>' +
      '<input id="settings-github-username" class="settings-input" type="text" placeholder="username" value="' +
        AnyaHelpers.escapeHtml(gh.username || '') + '" />' +
    '</div>' +
  '</div>'
}

SettingsPage.prototype.renderMemoryTab = function() {
  var mem = this.config.memory || {}
  return '<div class="settings-tab-content active">' +
    '<h3 class="settings-section-title">Memory</h3>' +
    '<p class="settings-section-desc">Configure AI conversation memory and context settings.</p>' +
    '<div class="settings-field">' +
      '<label class="settings-label">Context Window Size</label>' +
      '<input id="settings-context-window" class="settings-input" type="number" min="1" max="200" value="' +
        (mem.contextWindow || 50) + '" style="width:80px" /> messages' +
    '</div>' +
    '<div class="settings-field">' +
      '<label class="settings-checkbox">' +
        '<input type="checkbox" id="settings-save-conversations"' + (mem.saveConversations !== false ? ' checked' : '') + ' />' +
        '<span>Save Conversation History</span>' +
      '</label>' +
    '</div>' +
    '<div class="settings-field">' +
      '<button id="settings-clear-history" class="settings-btn settings-btn-danger">Clear Conversation History</button>' +
    '</div>' +
  '</div>'
}

SettingsPage.prototype.attachTabEvents = function() {
  var self = this

  var providerSelect = document.getElementById('settings-provider')
  if (providerSelect) {
    providerSelect.onchange = function() {
      self.updateModelOptions(providerSelect.value)
    }
    self.updateModelOptions(providerSelect.value)
  }

  var testBtn = document.getElementById('settings-test-connection')
  if (testBtn) {
    testBtn.onclick = function() { self.testConnection() }
  }

  var clearBtn = document.getElementById('settings-clear-history')
  if (clearBtn) {
    clearBtn.onclick = function() {
      if (confirm('Clear all conversation history?')) {
        if (window.app && window.app.chat) {
          window.app.chat.messages = []
          var el = window.app.chat.messagesEl
          if (el) el.innerHTML = '<div class="chat-msg assistant"><div class="chat-text">Conversation history cleared.</div></div>'
        }
        AnyaToast.success('Conversation history cleared')
      }
    }
  }

  var updateCheckBtn = document.getElementById('settings-check-update')
  if (updateCheckBtn) {
    updateCheckBtn.onclick = function() {
      var statusEl = document.getElementById('settings-update-status')
      statusEl.textContent = 'Checking...'
      window.anya.update.check().then(function(result) {
        if (result.success && result.hasUpdate) {
          window.anya.update.onNotification(function(event, data) {
            if (event === 'update-available') {
              statusEl.innerHTML = '<span style="color:var(--anya-success)">✓ Update available: v' + data.latestVersion + '</span>'
            }
          })
          window.anya.update.download && window.anya.update.download()
        } else if (result.success) {
          statusEl.innerHTML = '<span style="color:var(--anya-success)">✓ You\'re up to date!</span>'
        } else {
          statusEl.innerHTML = '<span style="color:var(--anya-error)">✕ Check failed: ' + (result.error || 'unknown') + '</span>'
        }
      })
    }
  }

  function syncColorPicker(pickerId, textId) {
    var picker = document.getElementById(pickerId)
    var text = document.getElementById(textId)
    if (picker && text) {
      picker.oninput = function() { text.value = this.value }
      text.oninput = function() {
        if (/^#[0-9a-f]{6}$/i.test(this.value)) picker.value = this.value
      }
    }
  }
  syncColorPicker('settings-color-primary', 'settings-color-primary-text')
  syncColorPicker('settings-color-bg', 'settings-color-bg-text')
  syncColorPicker('settings-color-text', 'settings-color-text-text')
}

SettingsPage.prototype.updateModelOptions = function(providerId) {
  var modelSelect = document.getElementById('settings-model')
  if (!modelSelect) return
  var providers = this.aiProviderService ? this.aiProviderService.providers : {}
  var cfg = providers[providerId]
  if (!cfg) {
    modelSelect.innerHTML = '<option value="">Select a provider first</option>'
    return
  }

  var html = ''
  if (cfg.models && cfg.models.length > 0) {
    for (var i = 0; i < cfg.models.length; i++) {
      var selected = cfg.models[i] === this.config.aiProvider.model ? ' selected' : ''
      html += '<option value="' + cfg.models[i] + '"' + selected + '>' + cfg.models[i] + '</option>'
    }
  }
  html += '<option value="__custom__"' + (this.config.aiProvider.model && cfg.models.indexOf(this.config.aiProvider.model) === -1 ? ' selected' : '') + '>Custom...</option>'
  modelSelect.innerHTML = html

  modelSelect.onchange = function() {
    if (this.value === '__custom__') {
      var custom = prompt('Enter model name:', self.config.aiProvider.model || cfg.defaultModel)
      if (custom) {
        var opt = document.createElement('option')
        opt.value = custom
        opt.text = custom
        opt.selected = true
        modelSelect.add(opt, modelSelect.options[modelSelect.options.length - 1])
      }
    }
  }
}

SettingsPage.prototype.testConnection = async function() {
  var resultEl = document.getElementById('settings-test-result')
  resultEl.textContent = 'Testing...'
  resultEl.style.color = 'var(--anya-text-muted)'

  if (!this.aiProviderService) {
    resultEl.textContent = 'No AI provider service available'
    resultEl.style.color = 'var(--anya-error)'
    return
  }

  try {
    this.aiProviderService.setProvider(
      document.getElementById('settings-provider').value,
      document.getElementById('settings-api-key').value,
      document.getElementById('settings-model').value
    )
    await this.aiProviderService.sendMessage([{ role: 'user', content: 'Say hello in one word.' }])
    resultEl.textContent = '✓ Connection successful!'
    resultEl.style.color = 'var(--anya-success)'
    AnyaToast.success('AI connection successful')
  } catch (err) {
    resultEl.textContent = '✕ Failed: ' + err.message
    resultEl.style.color = 'var(--anya-error)'
  }
}

SettingsPage.prototype.saveConfig = function() {
  var self = this

  var providerEl = document.getElementById('settings-provider')
  var keyEl = document.getElementById('settings-api-key')
  var modelEl = document.getElementById('settings-model')

  if (providerEl) {
    this.config.aiProvider.provider = providerEl.value
    this.config.aiProvider.apiKey = keyEl ? keyEl.value : ''
    this.config.aiProvider.model = modelEl ? modelEl.value : ''
  }

  var defaultModelEl = document.getElementById('settings-default-model')
  if (defaultModelEl) this.config.aiProvider.model = defaultModelEl.value

  var tempEl = document.getElementById('settings-temperature')
  if (tempEl) this.config.aiProvider.temperature = parseFloat(tempEl.value) || 0.7

  var maxTokensEl = document.getElementById('settings-max-tokens')
  if (maxTokensEl) this.config.aiProvider.maxTokens = parseInt(maxTokensEl.value) || 4096

  var promptEl = document.getElementById('settings-prompt')
  if (promptEl) this.config.prompt = promptEl.value

  var themeEl = document.getElementById('settings-theme')
  if (themeEl) this.config.appearance.theme = themeEl.value

  var fontSizeEl = document.getElementById('settings-font-size')
  if (fontSizeEl) this.config.appearance.fontSize = parseInt(fontSizeEl.value) || 13

  var fontFamilyEl = document.getElementById('settings-font-family')
  if (fontFamilyEl) this.config.appearance.fontFamily = fontFamilyEl.value

  var colorPrimaryEl = document.getElementById('settings-color-primary')
  if (colorPrimaryEl) this.config.appearance.primaryColor = colorPrimaryEl.value

  var colorBgEl = document.getElementById('settings-color-bg')
  if (colorBgEl) this.config.appearance.bgColor = colorBgEl.value

  var colorTextEl = document.getElementById('settings-color-text')
  if (colorTextEl) this.config.appearance.textColor = colorTextEl.value

  var autoSaveEl = document.getElementById('settings-autosave')
  if (autoSaveEl) this.config.workspace.autoSave = autoSaveEl.checked

  var formatOnSaveEl = document.getElementById('settings-format-onsave')
  if (formatOnSaveEl) this.config.workspace.formatOnSave = formatOnSaveEl.checked

  var tabSizeEl = document.getElementById('settings-tab-size')
  if (tabSizeEl) this.config.workspace.tabSize = parseInt(tabSizeEl.value) || 2

  var wordWrapEl = document.getElementById('settings-wordwrap')
  if (wordWrapEl) this.config.workspace.wordWrap = wordWrapEl.checked

  var branchEl = document.getElementById('settings-git-default-branch')
  if (branchEl) this.config.git.defaultBranch = branchEl.value || 'main'

  var autoFetchEl = document.getElementById('settings-git-autofetch')
  if (autoFetchEl) this.config.git.autoFetch = autoFetchEl.checked

  var githubTokenEl = document.getElementById('settings-github-token')
  if (githubTokenEl) this.config.github.token = githubTokenEl.value

  var githubUserEl = document.getElementById('settings-github-username')
  if (githubUserEl) this.config.github.username = githubUserEl.value

  var ctxWindowEl = document.getElementById('settings-context-window')
  if (ctxWindowEl) this.config.memory.contextWindow = parseInt(ctxWindowEl.value) || 50

  var saveConvEl = document.getElementById('settings-save-conversations')
  if (saveConvEl) this.config.memory.saveConversations = saveConvEl.checked

  ;(async function() {
    var result = await window.anya.config.write(self.config)
    if (result.success) {
      self.applyAppearance()
      AnyaToast.success('Settings saved')
      self.close()
    } else {
      AnyaToast.error('Failed to save settings: ' + result.error)
    }
  })()
}

SettingsPage.prototype.applyAppearance = function() {
  var app = this.config.appearance || {}
  var root = document.documentElement
  if (app.primaryColor) root.style.setProperty('--anya-primary', app.primaryColor)
  if (app.bgColor) root.style.setProperty('--anya-bg', app.bgColor)
  if (app.textColor) root.style.setProperty('--anya-text', app.textColor)
  if (app.fontSize) root.style.setProperty('--font-size', app.fontSize + 'px')
  AnyaToast.success('Appearance applied')
}

SettingsPage.prototype.close = function() {
  this.el.classList.add('hidden')
  this.isVisible = false
}

SettingsPage.prototype.toggle = function(aiProviderService) {
  if (this.isVisible) {
    this.close()
  } else {
    this.open(aiProviderService)
  }
}

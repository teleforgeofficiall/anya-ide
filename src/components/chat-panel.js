function ChatPanel(getEditorContext) {
  this.getEditorContext = getEditorContext
  this.aiProvider = new AIProviderService()
  this.messages = []
  this.isProcessing = false
  this.isVisible = true
  this.providerConfigured = false
  this.customPrompt = ''
  this.abortController = null
  this.sessions = []
  this.currentSessionId = null
  this.mentions = []
  this.agentMode = 'chat'
  this.activeSkills = []
  this.attachedFiles = []
  this.slashCommands = {
    '/plan': 'Create a project plan based on the current codebase',
    '/build': 'Start building the project with the current context',
    '/review': 'Review the current code for issues and improvements',
    '/fix': 'Fix any issues found in the current code',
    '/test': 'Generate and run tests for the current code',
    '/deploy': 'Prepare the project for deployment',
    '/commit': 'Create a git commit with AI-generated message',
    '/explain': 'Explain the current code in detail'
  }
  this.uploadHandler = null

  this.container = document.getElementById('chat-panel')
  this.messagesEl = document.getElementById('chat-messages')
  this.inputEl = document.getElementById('chat-input')
  this.sendBtn = document.getElementById('chat-send')
  this.modelSelect = document.getElementById('chat-model-select')
  this.sessionsPanel = document.getElementById('chat-sessions-panel')

  this.init()
}

ChatPanel.prototype.init = function() {
  var self = this

  document.getElementById('chat-close').onclick = function() { self.hide() }
  document.getElementById('chat-new-session').onclick = function() { self.newSession() }
  document.getElementById('chat-export').onclick = function() { self.exportChat() }
  document.getElementById('chat-sessions-btn').onclick = function() { self.toggleSessions() }
  var clearBtn = document.getElementById('chat-clear')
  if (clearBtn) {
    clearBtn.onclick = function() {
      if (confirm('Clear all messages?')) {
        self.messages = []
        self.messagesEl.innerHTML = ''
        self.addSystemMessage('Conversation cleared. ♥')
      }
    }
  }

  // Add file attach button to chat input area
  var inputArea = document.getElementById('chat-input-area')
  var attachBtn = document.createElement('button')
  attachBtn.id = 'chat-attach'
  attachBtn.title = 'Attach File'
  attachBtn.innerHTML = '📎'
  attachBtn.style.cssText = 'background:none;border:none;color:var(--anya-text-muted);cursor:pointer;font-size:16px;padding:4px 6px;border-radius:4px;transition:all 0.12s;flex-shrink:0;align-self:flex-end;margin-bottom:2px'
  attachBtn.onmouseenter = function() { this.style.color = 'var(--anya-primary)'; this.style.background = 'var(--anya-surface)' }
  attachBtn.onmouseleave = function() { this.style.color = ''; this.style.background = '' }
  attachBtn.onclick = function() { self.showFilePicker() }
  inputArea.insertBefore(attachBtn, this.inputEl)

  // Add attached files display area
  this.attachedFilesEl = document.createElement('div')
  this.attachedFilesEl.id = 'chat-attached-files'
  this.attachedFilesEl.style.cssText = 'display:none;padding:4px 8px;border-top:1px solid var(--anya-border);background:var(--anya-surface);flex-wrap:wrap;gap:4px;max-height:60px;overflow-y:auto;flex-shrink:0'
  var panel = document.getElementById('chat-panel')
  panel.insertBefore(this.attachedFilesEl, document.getElementById('chat-input-area'))

  // Add resize handle
  var resizeHandle = document.createElement('div')
  resizeHandle.id = 'chat-resize-handle'
  resizeHandle.style.cssText = 'position:absolute;left:0;top:0;bottom:0;width:4px;cursor:col-resize;z-index:10'
  resizeHandle.onmousedown = function(e) { self.startResize(e) }
  panel.style.position = 'relative'
  panel.insertBefore(resizeHandle, panel.firstChild)

  this.sendBtn.onclick = function() {
    if (self.isProcessing) self.cancelStream()
    else self.sendMessage()
  }
  this.inputEl.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (self.isProcessing) self.cancelStream()
      else self.sendMessage()
    }
  })

  // Handle @ mentions and slash commands
  this.inputEl.addEventListener('input', function(e) {
    self.handleInput(e)
  })

  // Handle paste for images and files
  this.inputEl.addEventListener('paste', function(e) {
    self.handlePaste(e)
  })

  // Handle drag and drop for files
  this.inputEl.addEventListener('dragover', function(e) {
    e.preventDefault()
    self.inputEl.style.borderColor = 'var(--anya-primary)'
  })

  this.inputEl.addEventListener('dragleave', function(e) {
    e.preventDefault()
    self.inputEl.style.borderColor = ''
  })

  this.inputEl.addEventListener('drop', function(e) {
    e.preventDefault()
    self.inputEl.style.borderColor = ''
    self.handleDrop(e)
  })

  this.modelSelect.onchange = function() {
    if (self.aiProvider.provider) {
      self.aiProvider.model = self.modelSelect.value
      self._saveProviderConfig()
    }
  }

  // Event delegation for code block and plan action buttons
  this.messagesEl.addEventListener('click', function(e) {
    var target = e.target.closest('.code-copy, .code-apply')
    if (target) {
      var code = target.getAttribute('data-code')
      if (!code) return
      try {
        code = decodeURIComponent(escape(atob(code)))
      } catch(er) { return }

      if (target.classList.contains('code-copy')) {
        ChatPanel._copyCodeText(code, target)
      } else if (target.classList.contains('code-apply')) {
        self.applyCode(code)
      }
      return
    }

    // Plan action buttons
    var planBtn = e.target.closest('.plan-btn-build')
    if (planBtn) {
      var planData = planBtn.getAttribute('data-plan')
      if (planData) { self.executePlan(planData) }
      return
    }

    var editBtn = e.target.closest('.plan-btn-edit')
    if (editBtn) {
      var planText = editBtn.getAttribute('data-plan')
      if (planText) { self.editPlan(planText) }
      return
    }
  })

  this.loadConfig()
  this.loadSessions()
  this.loadMentions()
}

ChatPanel.prototype.showFilePicker = function() {
  var self = this
  var input = document.createElement('input')
  input.type = 'file'
  input.multiple = true
  input.accept = '.txt,.js,.ts,.jsx,.tsx,.json,.md,.css,.html,.py,.rb,.rs,.go,.java,.cpp,.c,.h,.yaml,.yml,.toml,.xml,.svg,.sh,.ps1,.bat,.env,.sql,.csv,.gitignore'
  input.onchange = function() {
    var files = input.files
    for (var i = 0; i < files.length; i++) {
      self.attachFile(files[i])
    }
  }
  input.click()
}

ChatPanel.prototype.attachFile = function(file) {
  var self = this
  var reader = new FileReader()
  reader.onload = function(e) {
    var content = e.target.result
    self.attachedFiles.push({
      name: file.name,
      content: content,
      size: file.size
    })
    self.renderAttachedFiles()
    AnyaToast.info('Attached: ' + file.name)
  }
  reader.readAsText(file)
}

ChatPanel.prototype.renderAttachedFiles = function() {
  var self = this
  if (!this.attachedFilesEl) return
  if (this.attachedFiles.length === 0) {
    this.attachedFilesEl.style.display = 'none'
    return
  }
  this.attachedFilesEl.style.display = 'flex'
  this.attachedFilesEl.innerHTML = ''
  for (var i = 0; i < this.attachedFiles.length; i++) {
    var file = this.attachedFiles[i]
    var chip = document.createElement('span')
    chip.style.cssText = 'display:flex;align-items:center;gap:4px;padding:2px 8px;background:var(--anya-bg);border:1px solid var(--anya-border);border-radius:4px;font-size:11px;color:var(--anya-text)'
    chip.innerHTML = '<span>' + AnyaHelpers.escapeHtml(file.name) + '</span>' +
      '<span style="color:var(--anya-text-muted);font-size:10px;cursor:pointer;padding:0 2px" title="Remove">✕</span>'
    chip.lastChild.onclick = function(idx) {
      return function() {
        self.attachedFiles.splice(idx, 1)
        self.renderAttachedFiles()
      }
    }(i)
    this.attachedFilesEl.appendChild(chip)
  }
}

ChatPanel.prototype.removeAttachedFile = function(idx) {
  this.attachedFiles.splice(idx, 1)
  this.renderAttachedFiles()
}

ChatPanel.prototype.startResize = function(e) {
  var self = this
  var startX = e.clientX
  var startWidth = this.container.offsetWidth

  document.onmousemove = function(e) {
    var dx = startX - e.clientX
    var newWidth = Math.max(280, Math.min(800, startWidth + dx))
    self.container.style.width = newWidth + 'px'
    document.documentElement.style.setProperty('--chat-width', newWidth + 'px')
  }

  document.onmouseup = function() {
    document.onmousemove = null
    document.onmouseup = null
  }
}

ChatPanel.prototype.loadConfig = async function() {
  var self = this
  try {
    var result = await window.anya.config.read()
    if (result.success && result.config) {
      var cfg = result.config
      if (cfg.prompt) self.customPrompt = cfg.prompt
      // Migrate from old flat aiProvider format to per-provider format
      if (cfg.aiProvider && cfg.aiProvider.provider && !cfg.aiProvider.providers) {
        var oldProvider = cfg.aiProvider.provider
        cfg.aiProvider.providers = {}
        cfg.aiProvider.providers[oldProvider] = {
          apiKey: cfg.aiProvider.apiKey || '',
          model: cfg.aiProvider.model || '',
          temperature: cfg.aiProvider.temperature || 0.7,
          maxTokens: cfg.aiProvider.maxTokens || 4096
        }
        cfg.aiProvider.activeProvider = oldProvider
        delete cfg.aiProvider.apiKey
        delete cfg.aiProvider.model
        delete cfg.aiProvider.provider
        delete cfg.aiProvider.temperature
        delete cfg.aiProvider.maxTokens
        window.anya.config.write(cfg)
      }
      // Read from per-provider format
      if (cfg.aiProvider && cfg.aiProvider.activeProvider) {
        var activeProvider = cfg.aiProvider.activeProvider
        var providerSettings = (cfg.aiProvider.providers && cfg.aiProvider.providers[activeProvider]) || {}
        var info = self.aiProvider.getProviderInfo(activeProvider)
        var needsKey = !info || !info.local
        if (activeProvider && (providerSettings.apiKey || !needsKey)) {
          self.aiProvider.setProvider(activeProvider, providerSettings.apiKey || '', providerSettings.model)
          self.aiProvider.setConfig({
            temperature: providerSettings.temperature,
            maxTokens: providerSettings.maxTokens,
            contextWindow: cfg.memory ? cfg.memory.contextWindow : 50
          })
          self.providerConfigured = true
          self._updateModelSelect()

          // Update status bar
          if (window.app && window.app.statusBar) {
            window.app.statusBar.updateAI({ name: info ? info.name : activeProvider })
          }
        }
      }
    }
  } catch(e) {}
  if (!this.providerConfigured) {
    this.addSystemMessage('Welcome to AI Chat! ♥\nConfigure a provider in Settings to get started.')
  }
}

ChatPanel.prototype._updateModelSelect = function() {
  var self = this
  var info = this.aiProvider.getCurrentInfo()
  if (!info) return

  var models = this.aiProvider.getModels(this.aiProvider.provider)
  var html = ''
  for (var i = 0; i < models.length; i++) {
    var m = models[i]
    var mid = m.id || m
    var selected = mid === this.aiProvider.model ? ' selected' : ''
    var ctx = m.context ? ' (' + self._formatContext(m.context) + ')' : ''
    var pricing = ''
    if (m.pricing) {
      var isFree = m.pricing.prompt === '0' && m.pricing.completion === '0'
      pricing = isFree ? ' [FREE]' : ' [PAID]'
    }
    html += '<option value="' + AnyaHelpers.escapeHtml(String(mid)) + '"' + selected + '>' +
      AnyaHelpers.escapeHtml(String(mid) + ctx + pricing) + '</option>'
  }

  if (!html) {
    html = '<option value="' + AnyaHelpers.escapeHtml(info.model) + '">' + AnyaHelpers.escapeHtml(info.name + ' — ' + info.model) + '</option>'
  }

  this.modelSelect.innerHTML = html
  this.modelSelect.value = info.model
}

ChatPanel.prototype._formatContext = function(ctx) {
  if (!ctx) return ''
  var num = parseInt(ctx)
  if (isNaN(num)) return String(ctx)
  if (num >= 1000000) return Math.round(num / 1000) + 'M'
  if (num >= 1000) return Math.round(num / 1000) + 'K'
  return String(num)
}

ChatPanel.prototype._saveProviderConfig = async function() {
  try {
    var result = await window.anya.config.read()
    if (result.success) {
      var cfg = result.config || {}
      if (!cfg.aiProvider) cfg.aiProvider = {}
      if (!cfg.aiProvider.providers) cfg.aiProvider.providers = {}
      if (!cfg.aiProvider.providers[this.aiProvider.provider]) {
        cfg.aiProvider.providers[this.aiProvider.provider] = {}
      }
      cfg.aiProvider.providers[this.aiProvider.provider].model = this.aiProvider.model
      cfg.aiProvider.activeProvider = this.aiProvider.provider
      // Clean up old flat fields if they still exist
      delete cfg.aiProvider.provider
      delete cfg.aiProvider.apiKey
      delete cfg.aiProvider.model
      await window.anya.config.write(cfg)
    }
  } catch(e) {}
}

ChatPanel.prototype.handleInput = function(e) {
  var self = this
  var value = this.inputEl.value

  // Handle @ mentions
  var atMatches = value.match(/@([^\s]+)/g) || []
  if (atMatches.length > 0) {
    this.mentions = atMatches.map(function(m) { return m.substring(1) })
    this.updateInputSuggestions()
  }

  // Handle slash commands
  if (value.startsWith('/')) {
    var cmd = value.substring(1).split(' ')[0].toLowerCase()
    if (this.slashCommands[cmd]) {
      this.showSlashCommandHelp(cmd)
    }
  }
}

ChatPanel.prototype.handlePaste = function(e) {
  var self = this
  var items = e.clipboardData && e.clipboardData.items
  if (!items) return

  for (var i = 0; i < items.length; i++) {
    var item = items[i]
    if (item.type.indexOf('image') !== -1) {
      e.preventDefault()
      var file = item.getAsFile()
      this.processImage(file)
      break
    }
    // Handle file paste (from file explorer)
    if (item.kind === 'file') {
      e.preventDefault()
      var f = item.getAsFile()
      if (f) this.attachFile(f)
    }
  }
}

ChatPanel.prototype.handleDrop = function(e) {
  var self = this
  var files = e.dataTransfer.files
  if (files.length === 0) return

  for (var i = 0; i < files.length; i++) {
    var file = files[i]
    if (file.type.startsWith('image/')) {
      this.processImage(file)
    } else {
      this.attachFile(file)
    }
  }
}

ChatPanel.prototype.processImage = function(file) {
  var self = this
  if (!file.type.startsWith('image/')) return

  var reader = new FileReader()
  reader.onload = function(e) {
    var imgData = e.target.result
    self.addMessage('user', '[Image: ' + file.name + ']')
    self.addImageToChat(imgData, file.name)
  }
  reader.readAsDataURL(file)
}

ChatPanel.prototype.addImageToChat = function(imgData, fileName) {
  var imgEl = document.createElement('img')
  imgEl.src = imgData
  imgEl.style.maxWidth = '100%'
  imgEl.style.borderRadius = '4px'
  imgEl.style.marginTop = '8px'

  var msgEl = document.createElement('div')
  msgEl.className = 'chat-msg system'
  msgEl.appendChild(imgEl)

  this.messagesEl.appendChild(msgEl)
  this.messagesEl.scrollTop = this.messagesEl.scrollHeight
}

ChatPanel.prototype.loadMentions = async function() {
  var self = this
  try {
    var result = await window.anya.fileSystem.readDirectory('.')
    if (result.success) {
      var files = []
      for (var i = 0; i < result.items.length; i++) {
        var item = result.items[i]
        if (!item.isDirectory && !item.name.startsWith('.')) {
          files.push(item.name)
        }
      }
      this.mentions = files
      this.updateInputSuggestions()
    }
  } catch(e) {}
}

ChatPanel.prototype.updateInputSuggestions = function() {
  var self = this
  var input = this.inputEl

  if (this.mentions.length > 0) {
    var html = '<div class="mention-suggestions">'
    for (var i = 0; i < Math.min(this.mentions.length, 5); i++) {
      html += '<span class="mention-suggestion" data-name="' + this.mentions[i] + '">@' + this.mentions[i] + '</span> '
    }
    html += '</div>'

    var existing = document.querySelector('.mention-suggestions')
    if (existing) existing.remove()

    input.insertAdjacentHTML('beforeend', html)

    document.querySelectorAll('.mention-suggestion').forEach(function(el) {
      el.onclick = function(e) {
        e.stopPropagation()
        var name = el.dataset.name
        var cursorPos = input.selectionStart
        var value = input.value
        var newValue = value.substring(0, cursorPos) + '@' + name + ' ' + value.substring(cursorPos)
        input.value = newValue
        input.focus()
        var existing = document.querySelector('.mention-suggestions')
        if (existing) existing.remove()
      }
    })
  }
}

ChatPanel.prototype.showSlashCommandHelp = function(cmd) {
  var self = this
  var help = this.slashCommands[cmd] || 'Unknown command'

  this.addSystemMessage('**Slash Command:** ' + cmd + '\n' + help)
}

ChatPanel.prototype._buildSystemPrompt = function() {
  var ctx = this.getEditorContext()
  var prompt = this.customPrompt || 'You are Anya, a helpful AI coding assistant. Be concise. Use markdown for formatting.'

  // Agent mode prompt
  if (this.agentMode) {
    var modePrompts = {
      'chat': 'Focus on conversational assistance and answering questions.',
      'plan': 'You are in PLAN mode. Your task is to ANALYZE requests and create detailed plans. For any project request, first create a plan with: Project Overview, Pages/Components needed, Dependencies, Estimated Files, Architecture. List each file to be created with its full path. Format your plan clearly using markdown headers. End with "---END PLAN---" on its own line.',
      'build': 'You are in BUILD mode. Your task is to IMPLEMENT the plan by generating the actual code for each file. Create complete, working code files. After generating all files, provide a summary of what was created. Do NOT ask for approval - just build.',
      'review': 'You are in REVIEW mode. Focus on code quality, security, and best practices. Review code and suggest improvements.',
      'debug': 'You are in DEBUG mode. Focus on identifying and fixing bugs. Use debugging tools and analysis.',
      'deploy': 'You are in DEPLOY mode. Focus on deployment preparation, configuration, and release management.'
    }
    prompt += '\n\n' + (modePrompts[this.agentMode] || '')
  }

  // Active skills
  if (this.activeSkills && this.activeSkills.length > 0) {
    prompt += '\n\nActive Skills: ' + this.activeSkills.join(', ')
  }

  // Editor context
  if (ctx && ctx.filePath) {
    prompt += '\n\nCurrent file: ' + ctx.filePath + '\nLanguage: ' + ctx.language
    if (ctx.selectedText) {
      prompt += '\n\nSelected code:\n```' + ctx.language + '\n' + ctx.selectedText + '\n```'
    }
    if (ctx.fileContent) {
      prompt += '\n\nFile content:\n```' + (ctx.language || '') + '\n' + ctx.fileContent + '\n```'
    }
  }

  // Attached files
  if (this.attachedFiles && this.attachedFiles.length > 0) {
    prompt += '\n\nAttached Files:'
    for (var i = 0; i < this.attachedFiles.length; i++) {
      var f = this.attachedFiles[i]
      prompt += '\n\n=== ' + f.name + ' ===\n```\n' + f.content + '\n```'
    }
  }

  // Tool calling instructions (only in chat mode, not plan/build where built-in code extraction handles it)
  if (this.agentMode === 'chat') {
    var tools = this._getToolDefinitions()
    prompt += '\n\n## File System Tools\n'
    prompt += 'You can create, read, edit, and delete files using tool calls. When the user asks you to work with files, output tool calls in the following format:\n\n'
    prompt += '```\n[TOOL_CALL: tool_name]\nPATH: path/to/file\nCONTENT:\n(content here)\n[/TOOL_CALL]\n```\n\n'
    prompt += 'Available tools:\n'
    for (var i = 0; i < tools.length; i++) {
      var t = tools[i]
      prompt += '- **' + t.name + '**: ' + t.desc + '. Params: ' + t.params.map(function(p) { return p.name }).join(', ') + '\n'
    }
    prompt += '\nImportant rules:\n'
    prompt += '- For create_file, always include CONTENT with the file contents\n'
    prompt += '- For write_file, always include CONTENT with the new contents\n'
    prompt += '- Use relative paths when possible (the workspace folder is the base)\n'
    prompt += '- Only use tools when the user explicitly asks for file operations\n'
    prompt += '- You can use multiple tools in one response\n'
  }

  return prompt
}

ChatPanel.prototype.sendMessage = async function() {
  var self = this
  var text = this.inputEl.value.trim()
  if (!text && this.attachedFiles.length === 0) return
  if (!text) text = 'Analyze the attached files.'
  if (this.isProcessing) return

  if (!this.providerConfigured) {
    this.inputEl.value = ''
    this.addSystemMessage('Please configure an AI provider first. Go to Settings → AI Providers → select provider + enter API key.')
    return
  }

  this.inputEl.value = ''
  this.addMessage('user', text)

  // Clear attached files after sending
  var sentFiles = this.attachedFiles.slice()
  this.attachedFiles = []
  this.renderAttachedFiles()

  this.isProcessing = true
  this.sendBtn.textContent = '■ Stop'
  this.sendBtn.style.background = 'var(--anya-error)'

  var fullMessages = []

  var systemPrompt = this._buildSystemPrompt()
  fullMessages.push({ role: 'system', content: systemPrompt })

  // Add conversation history (limit to context window)
  var maxHistory = this.aiProvider.contextWindow || 50
  var history = this.messages.slice(-maxHistory)
  for (var i = 0; i < history.length; i++) {
    fullMessages.push({ role: history[i].role, content: history[i].content })
  }

  var loadingEl = this.addLoading()

  this.abortController = new AbortController()
  var signal = this.abortController.signal

  // Throttle markdown rendering to avoid O(n^2) re-render on every chunk
  var _renderTimer = null
  var _renderPending = false

  try {
    var responseText = ''
    var startTime = Date.now()

    await this.aiProvider.sendMessage(fullMessages, function(partial) {
      responseText = partial
      // Throttled render - coalesce rapid chunks into one render
      if (!_renderPending) {
        _renderPending = true
        if (_renderTimer) clearTimeout(_renderTimer)
        _renderTimer = setTimeout(function() {
          _renderPending = false
          var el = self.messagesEl.querySelector('.chat-msg.streaming .chat-text')
          if (el) {
            el.innerHTML = self.renderMarkdown(responseText, true)
            self.messagesEl.scrollTop = self.messagesEl.scrollHeight
          }
        }, 30)
      }
      // Always scroll to bottom for immediate feedback
      self.messagesEl.scrollTop = self.messagesEl.scrollHeight
    }, signal)

    if (_renderTimer) clearTimeout(_renderTimer)

    // Remove loading element before adding final message to avoid duplicates
    loadingEl.remove()

    // Guard: if response is empty, show a fallback message
    if (!responseText || !responseText.trim()) {
      responseText = '_The AI returned an empty response. Check your provider/model settings or try again._'
    }

    // Check if this is a plan mode response with a plan
    if (this.agentMode === 'plan' || responseText.indexOf('---END PLAN---') !== -1 || responseText.indexOf('### Files to Create') !== -1) {
      // Extract plan data and add action buttons
      var planActions = this._extractPlanFromResponse(responseText)
      if (planActions) {
        responseText = planActions.planText
        var msgEl = this.addMessage('assistant', responseText, Date.now() - startTime)
        // Add plan card with action buttons
        this._addPlanCard(msgEl, responseText, planActions.files)
      } else {
        var msgEl = self.addMessage('assistant', responseText, Date.now() - startTime)
      }
    } else {
      // In chat mode, process tool calls from the AI response
      if (this.agentMode === 'chat') {
        var processed = await self._processToolCalls(responseText)
        if (processed.results && processed.results.length > 0) {
          responseText = processed.text || responseText
          var msgEl = self.addMessage('assistant', responseText, Date.now() - startTime)
          // Add tool result cards below the message
          for (var ti = 0; ti < processed.results.length; ti++) {
            var tr = processed.results[ti]
            var cardHtml = self._renderToolResultCard(tr.toolName, tr.params, tr.result)
            var cardDiv = document.createElement('div')
            cardDiv.innerHTML = cardHtml
            msgEl.appendChild(cardDiv.firstChild)
            // If read_file returned content, show it in a follow-up message
            if (tr.toolName === 'read_file' && tr.result.success && tr.result.content) {
              self.addMessage('tool-result', '📖 **' + AnyaHelpers.escapeHtml(tr.params.path) + '**\n```\n' + tr.result.content + '\n```')
            }
          }
        } else {
          var msgEl = self.addMessage('assistant', responseText, Date.now() - startTime)
        }
      } else {
        var msgEl = self.addMessage('assistant', responseText, Date.now() - startTime)
      }
    }
    self._saveConversations()
  } catch (err) {
    if (err.name === 'AbortError') {
      loadingEl.remove()
      self.addSystemMessage('Response cancelled.')
    } else {
      loadingEl.remove()
      var info = null
      try {
        if (self.aiProvider && typeof self.aiProvider.normalizeError === 'function') {
          info = self.aiProvider.normalizeError(err, self.aiProvider.provider, self.aiProvider.model)
        }
      } catch (e) {}
      if (!info) info = { provider: self.aiProvider ? self.aiProvider.provider : 'AI', model: self.aiProvider ? self.aiProvider.model : '', code: 0, raw: (err && err.message) || String(err), fix: 'Check your AI provider settings.' }

      var errHtml = '<div class="chat-error-card">' +
        '<div class="chat-error-head">AI Request Failed</div>' +
        '<div class="chat-error-row"><span class="chat-error-key">Provider</span><span class="chat-error-val">' + AnyaHelpers.escapeHtml(info.provider) + '</span></div>' +
        '<div class="chat-error-row"><span class="chat-error-key">Model</span><span class="chat-error-val">' + AnyaHelpers.escapeHtml(info.model) + '</span></div>' +
        '<div class="chat-error-row"><span class="chat-error-key">Error Code</span><span class="chat-error-val">' + (info.code || 'N/A') + '</span></div>' +
        '<div class="chat-error-row"><span class="chat-error-key">Raw</span><span class="chat-error-val chat-error-raw">' + AnyaHelpers.escapeHtml(info.raw) + '</span></div>' +
        '<div class="chat-error-row"><span class="chat-error-key">Fix</span><span class="chat-error-val chat-error-fix">' + AnyaHelpers.escapeHtml(info.fix) + '</span></div>' +
        '</div>'
      self.addMessage('error', errHtml)
      try { AnyaToast.error('AI ' + (info.code || '') + ': ' + info.fix) } catch (e) {}
    }
  }

  this.isProcessing = false
  this.abortController = null
  this.sendBtn.textContent = 'Send'
  this.sendBtn.style.background = ''
}

// Extract plan files from AI response
ChatPanel.prototype._extractPlanFromResponse = function(responseText) {
  var files = []

  // Remove the END PLAN marker from display text
  var planText = responseText.replace(/---END PLAN---/g, '').trim()

  // Parse files from markdown code blocks with file paths
  // Pattern: `path/to/file` or /path/to/file or - `path`
  var fileRegex = /`([^`]+)`/g
  var match
  while ((match = fileRegex.exec(planText)) !== null) {
    var path = match[1].trim()
    // Filter to likely file paths (have extension or common dir names)
    if (/\.\w+$/.test(path) || path.indexOf('/') !== -1 || path.indexOf('\\') !== -1) {
      if (files.indexOf(path) === -1) files.push(path)
    }
  }

  // Also parse markdown list items with file paths
  var listRegex = /[-*]\s+`?([^`\n]+\.\w+)`?/g
  while ((match = listRegex.exec(planText)) !== null) {
    var p = match[1].trim()
    if (files.indexOf(p) === -1) files.push(p)
  }

  return { planText: planText, files: files }
}

// Add plan card with Build and Edit Plan buttons
ChatPanel.prototype._addPlanCard = function(msgEl, planText, files) {
  var planCard = document.createElement('div')
  planCard.className = 'plan-card'
  planCard.style.cssText = 'margin-top:12px;padding:12px;background:var(--anya-bg-secondary);border:1px solid var(--anya-primary);border-radius:8px'

  var fileList = ''
  if (files && files.length > 0) {
    fileList = '<div style="font-size:11px;color:var(--anya-text-muted);margin-bottom:8px">📋 Files in plan: ' + files.length + '</div>' +
      '<div style="font-size:11px;max-height:80px;overflow-y:auto;margin-bottom:8px">'
    for (var i = 0; i < files.length; i++) {
      fileList += '<div style="padding:1px 0;color:var(--anya-text-secondary)">📄 ' + AnyaHelpers.escapeHtml(files[i]) + '</div>'
    }
    fileList += '</div>'
  }

  var encodedPlan = btoa(unescape(encodeURIComponent(planText)))
  planCard.innerHTML =
    '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
      fileList +
      '<div style="width:100%;display:flex;gap:8px;margin-top:4px">' +
        '<button class="plan-btn-build" data-plan=\'' + encodedPlan + '\' style="flex:1;padding:8px 16px;background:var(--anya-primary);border:none;border-radius:6px;color:white;font-size:12px;font-weight:600;cursor:pointer">🏗️ Build Project</button>' +
        '<button class="plan-btn-edit" data-plan=\'' + encodedPlan + '\' style="padding:8px 16px;background:var(--anya-surface);border:1px solid var(--anya-border);border-radius:6px;color:var(--anya-text);font-size:12px;cursor:pointer">✏️ Edit Plan</button>' +
      '</div>' +
    '</div>'

  msgEl.appendChild(planCard)
}

// Execute the plan - build files
ChatPanel.prototype.executePlan = async function(encodedPlan) {
  var self = this
  try {
    var planText = decodeURIComponent(escape(atob(encodedPlan)))
  } catch(e) { return }

  // Add a message showing we're building
  this.addMessage('assistant', '🏗️ **Building project...**\n\nCreating files and generating code based on the plan.')

  // Switch to build mode
  this.setAgentMode('build')

  // Send a build message
  this.inputEl.value = 'Build the project based on this plan:\n\n' + planText + '\n\nCreate each file with complete working code.'
  this.sendMessage()
}

// Edit the plan
ChatPanel.prototype.editPlan = function(encodedPlan) {
  var self = this
  try {
    var planText = decodeURIComponent(escape(atob(encodedPlan)))
  } catch(e) { return }

  this.inputEl.value = 'Modify this plan:\n\n' + planText + '\n\nPlease provide an updated plan.'
  this.inputEl.focus()
}

ChatPanel.prototype.cancelStream = function() {
  if (this.abortController) {
    this.abortController.abort()
    this.abortController = null
  }
}

// Tool definitions for AI file operations
ChatPanel.prototype._getToolDefinitions = function() {
  return [
    { name: 'create_file', desc: 'Create a new file with content', params: [{ name: 'PATH', desc: 'File path (absolute or relative to workspace)' }, { name: 'CONTENT', desc: 'File content' }] },
    { name: 'create_directory', desc: 'Create a directory', params: [{ name: 'PATH', desc: 'Directory path' }] },
    { name: 'read_file', desc: 'Read a file and return its content', params: [{ name: 'PATH', desc: 'File path' }] },
    { name: 'write_file', desc: 'Write/overwrite content to a file', params: [{ name: 'PATH', desc: 'File path' }, { name: 'CONTENT', desc: 'New file content' }] },
    { name: 'list_directory', desc: 'List files and folders in a directory', params: [{ name: 'PATH', desc: 'Directory path' }] },
    { name: 'delete_file', desc: 'Delete a file or empty directory', params: [{ name: 'PATH', desc: 'File or directory path' }] }
  ]
}

// Parse tool calls from AI response text
// Format: [TOOL_CALL: tool_name]\nPATH: ...\nCONTENT:\n...\n[/TOOL_CALL]
ChatPanel.prototype._parseToolCalls = function(text) {
  if (!text || text.indexOf('[TOOL_CALL:') === -1) return []
  var calls = []
  var regex = /\[TOOL_CALL:\s*(\w+)\]\n([\s\S]*?)\[\/TOOL_CALL\]/g
  var match
  while ((match = regex.exec(text)) !== null) {
    var name = match[1]
    var body = match[2]
    var params = {}
    // Parse key-value lines and multi-line CONTENT
    var contentMatch = body.match(/^CONTENT:\n([\s\S]*)$/m)
    if (contentMatch) {
      params.content = contentMatch[1].replace(/\r\n?$/, '')
      // Remove CONTENT block from body for line-by-line parsing
      body = body.replace(/^CONTENT:\n[\s\S]*$/, '').trim()
    }
    // Parse line-based params (PATH: value, etc.)
    var lines = body.split('\n')
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim()
      var colonIdx = line.indexOf(':')
      if (colonIdx > 0) {
        var key = line.substring(0, colonIdx).trim().toLowerCase()
        var val = line.substring(colonIdx + 1).trim()
        if (key === 'path') params.path = val
      }
    }
    if (params.path) {
      calls.push({ name: name, params: params })
    }
  }
  return calls
}

// Resolve a path (relative paths use workspace folder as base)
ChatPanel.prototype._resolvePath = function(path) {
  if (!path) return ''
  if (path.startsWith('/') || path.indexOf(':') !== -1) return path // absolute
  var baseDir = ''
  if (window.app && window.app.sidebar && window.app.sidebar.currentFolder) {
    baseDir = window.app.sidebar.currentFolder
  }
  if (!baseDir && window.app && window.app.editorManager && window.app.editorManager.currentFilePath) {
    // Extract directory from current file path (no path module available with contextIsolation)
    var fp = window.app.editorManager.currentFilePath
    var lastSepIdx = Math.max(fp.lastIndexOf('/'), fp.lastIndexOf('\\'))
    if (lastSepIdx > 0) baseDir = fp.substring(0, lastSepIdx)
  }
  if (!baseDir) return path
  // Use path.join equivalent for forward-slash paths
  var sep = baseDir.indexOf('\\') !== -1 ? '\\' : '/'
  if (baseDir.endsWith(sep)) baseDir = baseDir.slice(0, -1)
  return baseDir + sep + path.replace(/\\/g, sep).replace(/\//g, sep)
}

// Execute a single tool call via IPC
ChatPanel.prototype._executeToolCall = async function(toolName, params) {
  var path = this._resolvePath(params.path)
  if (!path) return { success: false, error: 'No path specified' }

  try {
    switch (toolName) {
      case 'create_file': {
        // Create parent directory first
        var dir = path.substring(0, Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')))
        if (dir) await window.anya.fileSystem.createDirectory(dir)
        await window.anya.fileSystem.writeFile(path, params.content || '')
        // Auto-open created file in editor
        try {
          if (window.app && window.app.editorManager && window.app.editorManager.openFile) {
            window.app.editorManager.openFile(path)
          }
        } catch(e) {}
        // Refresh sidebar
        try { if (window.app && window.app.sidebar && window.app.sidebar.refresh) window.app.sidebar.refresh() } catch(e) {}
        return { success: true, message: 'Created: ' + params.path }
      }
      case 'create_directory': {
        await window.anya.fileSystem.createDirectory(path)
        try { if (window.app && window.app.sidebar && window.app.sidebar.refresh) window.app.sidebar.refresh() } catch(e) {}
        return { success: true, message: 'Created directory: ' + params.path }
      }
      case 'read_file': {
        var result = await window.anya.fileSystem.readFile(path)
        if (result.success) return { success: true, message: 'Read: ' + params.path, content: result.content }
        return { success: false, error: result.error || 'Failed to read file' }
      }
      case 'write_file': {
        await window.anya.fileSystem.writeFile(path, params.content || '')
        return { success: true, message: 'Updated: ' + params.path }
      }
      case 'list_directory': {
        var list = await window.anya.fileSystem.readDirectory(path)
        if (list.success) {
          var items = list.entries.map(function(e) { return e.name + (e.isDirectory ? '/' : '') })
          return { success: true, message: 'Directory: ' + params.path, content: items.join('\n') }
        }
        return { success: false, error: list.error || 'Failed to list directory' }
      }
      case 'delete_file': {
        await window.anya.fileSystem.deleteEntry(path)
        try { if (window.app && window.app.sidebar && window.app.sidebar.refresh) window.app.sidebar.refresh() } catch(e) {}
        return { success: true, message: 'Deleted: ' + params.path }
      }
      default:
        return { success: false, error: 'Unknown tool: ' + toolName }
    }
  } catch (err) {
    return { success: false, error: err.message || String(err) }
  }
}

// Render a tool call result card in the chat
ChatPanel.prototype._renderToolResultCard = function(toolName, params, result) {
  var iconMap = {
    create_file: '📄', create_directory: '📁', read_file: '📖',
    write_file: '✏️', list_directory: '📂', delete_file: '🗑️'
  }
  var icon = iconMap[toolName] || '🔧'
  var statusIcon = result.success ? '✅' : '❌'
  var contentHtml = ''
  if (result.content) {
    contentHtml = '<pre class="tool-result-content">' + AnyaHelpers.escapeHtml(result.content.slice(0, 2000)) + '</pre>'
  }
  return '<div class="tool-call-card tool-call-' + (result.success ? 'success' : 'error') + '">' +
    '<div class="tool-call-header">' +
      '<span class="tool-call-icon">' + icon + '</span>' +
      '<span class="tool-call-name">' + AnyaHelpers.escapeHtml(toolName) + '</span>' +
      '<span class="tool-call-status">' + statusIcon + '</span>' +
    '</div>' +
    '<div class="tool-call-path">' + AnyaHelpers.escapeHtml(params.path || '') + '</div>' +
    '<div class="tool-call-message">' + AnyaHelpers.escapeHtml(result.message || result.error || '') + '</div>' +
    contentHtml +
  '</div>'
}

// Execute all tool calls found in text, return cleaned text (without tool call blocks)
ChatPanel.prototype._processToolCalls = async function(text) {
  var calls = this._parseToolCalls(text)
  if (calls.length === 0) return { text: text, results: [] }
  var results = []
  for (var i = 0; i < calls.length; i++) {
    var call = calls[i]
    var result = await this._executeToolCall(call.name, call.params)
    results.push({ toolName: call.name, params: call.params, result: result })
  }
  // Remove tool call blocks from display text
  var cleanText = text.replace(/\[TOOL_CALL:\s*\w+\]\n[\s\S]*?\[\/TOOL_CALL\]/g, '').trim()
  return { text: cleanText, results: results }
}

ChatPanel.prototype.addMessage = function(role, content, timing) {
  var el = document.createElement('div')
  el.className = 'chat-msg ' + role
  if (role === 'assistant') {
    var textEl = document.createElement('div')
    textEl.className = 'chat-text'
    textEl.innerHTML = this.renderMarkdown(content, false)
    el.appendChild(textEl)

    if (timing) {
      var timingEl = document.createElement('div')
      timingEl.className = 'chat-timing'
      timingEl.textContent = '⏱ ' + timing + 'ms'
      el.appendChild(timingEl)
    }
  } else if (role === 'user') {
    el.textContent = content
  } else {
    var textEl = document.createElement('div')
    textEl.className = 'chat-text'
    textEl.innerHTML = this.renderMarkdown(content, false)
    el.appendChild(textEl)
  }
  this.messagesEl.appendChild(el)
  this.messages.push({ role: role, content: content })
  this.messagesEl.scrollTop = this.messagesEl.scrollHeight

  // If in build mode, extract code blocks and create files
  if (role === 'assistant' && this.agentMode === 'build') {
    this._extractAndCreateFiles(content)
  }

  return el
}

// Extract code blocks from AI response and create files
ChatPanel.prototype._extractAndCreateFiles = function(content) {
  var self = this

  // If sidebar has a current folder, use it
  var baseDir = (window.app && window.app.sidebar && window.app.sidebar.currentFolder) ? window.app.sidebar.currentFolder : null

  // Parse code blocks with file paths
  // Pattern: ```language:path/to/file or ```language filename="path/to/file"
  // Also: ### `path/to/file` then ```code
  var fileBlocks = []
  var codeBlockRegex = /```(\w+)(?:\s+(?:file(?:name)?=)?['"]?([^\s'"]+)['"]?)?\n([\s\S]*?)```/g
  var match

  while ((match = codeBlockRegex.exec(content)) !== null) {
    var lang = match[1] || ''
    var filePath = match[2] || self._guessFilePathFromContent(match[3], lang)
    var code = match[3]

    if (filePath && code) {
      fileBlocks.push({ path: filePath, code: code, language: lang })
    }
  }

  if (fileBlocks.length === 0) {
    // Try to find file paths from markdown headers before code blocks
    var headerBlockRegex = /###\s+`([^`]+)`\s*\n```(\w*)\n([\s\S]*?)```/g
    while ((match = headerBlockRegex.exec(content)) !== null) {
      var fp = match[1]
      var cd = match[3]
      if (fp && cd && fileBlocks.every(function(f) { return f.path !== fp })) {
        fileBlocks.push({ path: fp, code: cd, language: match[2] || '' })
      }
    }
  }

  if (fileBlocks.length === 0) return

  // No workspace open, prompt user
  if (!baseDir) {
    this.addSystemMessage('⚠️ **No workspace open.**\n\nTo create files, please open a folder first using **File → Open Folder** (Ctrl+K), then ask again.')
    return
  }

  // Create folders and files
  AnyaToast.info('Creating ' + fileBlocks.length + ' file(s)...')

  ;(async function() {
    var created = 0
    for (var i = 0; i < fileBlocks.length; i++) {
      var fb = fileBlocks[i]
      // Normalize path to Windows backslashes
      var relPath = fb.path.replace(/^[/\\]+/, '').replace(/\//g, '\\')
      var fullPath = baseDir.replace(/\/$/, '').replace(/\\$/, '') + '\\' + relPath
      var dir = fullPath.substring(0, fullPath.lastIndexOf('\\'))

      try {
        // Create directory if needed
        if (dir && dir !== fullPath) {
          await window.anya.fileSystem.createDirectory(dir)
        }
        // Create file with content
        await window.anya.fileSystem.writeFile(fullPath, fb.code)
        created++
      } catch (e) {
        console.error('Failed to create file:', fullPath, e)
      }
    }

    // Refresh sidebar
    if (window.app && window.app.sidebar) {
      window.app.sidebar.refresh()
    }

    // Open the first created file in editor
    if (created > 0 && fileBlocks[0] && window.app && window.app.editorManager) {
      var firstPath = baseDir.replace(/\/$/, '').replace(/\\$/, '') + '\\' + fileBlocks[0].path.replace(/\//g, '\\')
      window.app.editorManager.openFile(firstPath)
    }

    AnyaToast.success('Created ' + created + ' file(s) successfully!')
  })()
}

// Guess file path from code content based on language
ChatPanel.prototype._guessFilePathFromContent = function(code, language) {
  // Check for common patterns
  var extMap = {
    'javascript': 'js', 'typescript': 'ts', 'jsx': 'jsx', 'tsx': 'tsx',
    'html': 'html', 'css': 'css', 'scss': 'scss',
    'json': 'json', 'md': 'md', 'python': 'py', 'ruby': 'rb',
    'rust': 'rs', 'go': 'go', 'java': 'java', 'cpp': 'cpp', 'c': 'c',
    'yaml': 'yaml', 'yml': 'yaml', 'xml': 'xml', 'svg': 'svg',
    'sql': 'sql', 'sh': 'sh', 'bash': 'sh', 'powershell': 'ps1'
  }

  // Generate a name based on content length and language
  var ext = extMap[language] || 'txt'
  var hash = code.length.toString(36)
  return 'generated-' + hash + '.' + ext
}

ChatPanel.prototype.addSystemMessage = function(text) {
  this.addMessage('assistant', text)
}

ChatPanel.prototype.addLoading = function() {
  var el = document.createElement('div')
  el.className = 'chat-msg assistant streaming'
  el.innerHTML = '<div class="chat-text"><span class="chat-typing"><span class="spinner"></span> Thinking...</span></div>'
  this.messagesEl.appendChild(el)
  this.messagesEl.scrollTop = this.messagesEl.scrollHeight
  return el
}

ChatPanel.prototype.renderMarkdown = function(text, isStreaming) {
  var html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // Headers
  html = html.replace(/^### (.+)$/gm, '<h4>$1</h4>')
  html = html.replace(/^## (.+)$/gm, '<h3>$1</h3>')
  html = html.replace(/^# (.+)$/gm, '<h2>$1</h2>')

  // Blockquotes
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>')

  // Ordered lists
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ol>$&</ol>')

  // Unordered lists
  html = html.replace(/^[*-] (.+)$/gm, '<li>$1</li>')
  html = html.replace(/(<li>.*<\/li>\n?)+/g, function(m) {
    if (m.indexOf('<ol>') !== -1) return m
    return '<ul>' + m + '</ul>'
  })

  // Code blocks (must be before inline code)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, function(m, lang, code) {
    var langLabel = lang ? '<span class="code-lang">' + lang + '</span>' : ''
    var escaped = AnyaHelpers.escapeHtml(code)
    var encoded = btoa(unescape(encodeURIComponent(code)))
    if (!isStreaming) {
      var applyBtn = ''
      if (typeof window.app !== 'undefined' && window.app.editorManager && window.app.editorManager.editor) {
        applyBtn = '<button class="code-apply" data-code="' + encoded + '" title="Insert into Editor ↗">Apply</button>'
      }
      return '<div class="code-block">' +
        '<div class="code-header">' + langLabel +
          '<div class="code-actions">' +
            '<button class="code-copy" data-code="' + encoded + '" title="Copy">📋 Copy</button>' +
            applyBtn +
          '</div>' +
        '</div>' +
        '<pre><code>' + escaped + '</code></pre>' +
      '</div>'
    }
    return '<div class="code-block"><pre><code>' + escaped + '</code></pre></div>'
  })

  // Inline code
  var counter = 0
  html = html.replace(/`([^`]+)`/g, function(m, code) {
    return '<code>' + AnyaHelpers.escapeHtml(code) + '</code>'
  })

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')

  // Bold + Italic
  html = html.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>')
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>')

  // Line breaks
  html = html.replace(/\n/g, '<br>')

  return html
}

ChatPanel._copyCodeText = function(text, btn) {
  navigator.clipboard.writeText(text).then(function() {
    btn.textContent = '✓ Copied!'
    setTimeout(function() { btn.textContent = '📋 Copy' }, 2000)
  }).catch(function() {
    var ta = document.createElement('textarea')
    ta.value = text
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    ta.remove()
    btn.textContent = '✓ Copied!'
    setTimeout(function() { btn.textContent = '📋 Copy' }, 2000)
  })
}

ChatPanel.prototype.applyCode = function(code) {
  try {
    var editor = window.app.editorManager.editor
    if (!editor) { AnyaToast.error('No editor open'); return }

    var selection = editor.getSelection()
    if (selection && !selection.isEmpty()) {
      editor.executeEdits('anya-chat', [{ range: selection, text: code }])
    } else {
      var pos = editor.getPosition()
      var range = {
        startLineNumber: pos.lineNumber,
        startColumn: pos.column,
        endLineNumber: pos.lineNumber,
        endColumn: pos.column
      }
      editor.executeEdits('anya-chat', [{ range: range, text: code }])
    }
    editor.focus()
    AnyaToast.success('Code inserted into editor ↗')
  } catch(e) {
    AnyaToast.error('Failed to insert code: ' + e.message)
  }
}

// === Session Management ===
ChatPanel.prototype.newSession = function() {
  this.messages = []
  this.messagesEl.innerHTML = ''
  this.currentSessionId = Date.now().toString(36)
  this.addSystemMessage('New conversation started. Ask me anything! ♥')
  this.hideSessions()
}

ChatPanel.prototype._saveConversations = async function() {
  try {
    var result = await window.anya.config.read()
    if (!result.success) return
    var cfg = result.config || {}
    if (cfg.memory && cfg.memory.saveConversations === false) return

    if (!cfg.conversations) cfg.conversations = []
    var sessionId = this.currentSessionId || Date.now().toString(36)
    this.currentSessionId = sessionId

    var title = ''
    for (var i = 0; i < this.messages.length; i++) {
      if (this.messages[i].role === 'user') {
        title = this.messages[i].content.slice(0, 60)
        break
      }
    }

    var existing = -1
    for (var j = 0; j < cfg.conversations.length; j++) {
      if (cfg.conversations[j].id === sessionId) { existing = j; break }
    }

    var conv = { id: sessionId, title: title || 'Chat', messages: this.messages, timestamp: Date.now() }
    if (existing >= 0) cfg.conversations[existing] = conv
    else cfg.conversations.unshift(conv)

    // Keep max 50 sessions
    if (cfg.conversations.length > 50) cfg.conversations = cfg.conversations.slice(0, 50)

    await window.anya.config.write(cfg)
  } catch(e) {}
}

ChatPanel.prototype.loadSessions = async function() {
  try {
    var result = await window.anya.config.read()
    if (result.success && result.config && result.config.conversations) {
      this.sessions = result.config.conversations
      if (this.sessions.length > 0 && !this.currentSessionId) {
        var last = this.sessions[0]
        this.currentSessionId = last.id
        this.restoreSession(last)
      }
    }
  } catch(e) {}
}

ChatPanel.prototype.restoreSession = function(session) {
  this.messages = session.messages || []
  this.messagesEl.innerHTML = ''
  for (var i = 0; i < this.messages.length; i++) {
    var el = this.addMessageToDOM(this.messages[i].role, this.messages[i].content)
  }
  if (this.messages.length === 0) {
    this.addSystemMessage('Welcome back! ♥')
  }
  this.currentSessionId = session.id
}

ChatPanel.prototype.addMessageToDOM = function(role, content) {
  var el = document.createElement('div')
  el.className = 'chat-msg ' + role
  if (role === 'user') {
    el.textContent = content
  } else {
    var textEl = document.createElement('div')
    textEl.className = 'chat-text'
    textEl.innerHTML = this.renderMarkdown(content, false)
    el.appendChild(textEl)
  }
  this.messagesEl.appendChild(el)
  return el
}

ChatPanel.prototype.toggleSessions = function() {
  if (this.sessionsPanel.classList.contains('hidden')) this.showSessions()
  else this.hideSessions()
}

ChatPanel.prototype.showSessions = function() {
  var self = this
  var html = '<div class="sessions-header"><span>Chat History</span><button class="sessions-close" onclick="window.app.chat.hideSessions()">✕</button></div>'
  if (this.sessions.length === 0) {
    html += '<div class="sessions-empty">No saved conversations yet.</div>'
  } else {
    html += '<div class="sessions-list">'
    for (var i = 0; i < this.sessions.length; i++) {
      var s = this.sessions[i]
      var active = s.id === this.currentSessionId ? ' active' : ''
      html += '<div class="session-item' + active + '" data-id="' + s.id + '">' +
        '<div class="session-title">' + AnyaHelpers.escapeHtml(s.title || 'Chat') + '</div>' +
        '<div class="session-time">' + (s.timestamp ? new Date(s.timestamp).toLocaleDateString() : '') + '</div>' +
        '<button class="session-delete" data-id="' + s.id + '" title="Delete">✕</button>' +
      '</div>'
    }
    html += '</div>'
  }
  this.sessionsPanel.innerHTML = html
  this.sessionsPanel.classList.remove('hidden')

  // Session click
  this.sessionsPanel.querySelectorAll('.session-item').forEach(function(el) {
    el.onclick = function(e) {
      if (e.target.closest('.session-delete')) return
      var id = el.dataset.id
      var session = self.sessions.find(function(s) { return s.id === id })
      if (session) {
        self.hideSessions()
        self.restoreSession(session)
      }
    }
  })

  // Delete
  this.sessionsPanel.querySelectorAll('.session-delete').forEach(function(el) {
    el.onclick = function(e) {
      e.stopPropagation()
      var id = el.dataset.id
      if (confirm('Delete this conversation?')) {
        self.sessions = self.sessions.filter(function(s) { return s.id !== id })
        self._updateSessionsInConfig()
        if (id === self.currentSessionId) self.newSession()
        self.showSessions()
      }
    }
  })
}

ChatPanel.prototype.hideSessions = function() {
  this.sessionsPanel.classList.add('hidden')
}

ChatPanel.prototype._updateSessionsInConfig = async function() {
  try {
    var result = await window.anya.config.read()
    if (result.success) {
      var cfg = result.config || {}
      cfg.conversations = this.sessions
      await window.anya.config.write(cfg)
    }
  } catch(e) {}
}

ChatPanel.prototype.exportChat = function() {
  if (this.messages.length === 0) {
    AnyaToast.info('No messages to export.')
    return
  }
  var text = '# AI Chat Export\n\n'
  for (var i = 0; i < this.messages.length; i++) {
    var m = this.messages[i]
    if (m.role === 'user') text += '**You:** ' + m.content + '\n\n'
    else if (m.role === 'assistant') text += '**AI:** ' + m.content + '\n\n'
    else text += '**System:** ' + m.content + '\n\n'
  }
  navigator.clipboard.writeText(text).then(function() {
    AnyaToast.success('Chat copied to clipboard!')
  }).catch(function() {
    // Fallback
    var ta = document.createElement('textarea')
    ta.value = text
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    ta.remove()
    AnyaToast.success('Chat copied to clipboard!')
  })
}

ChatPanel.prototype.toggle = function() {
  if (this.isVisible) this.hide()
  else this.show()
}

ChatPanel.prototype.show = function() {
  this.container.classList.remove('hidden', 'chat-collapsed')
  this.isVisible = true
  void this.container.offsetWidth
  var self = this
  setTimeout(function() { self.inputEl.focus() }, 150)
}

ChatPanel.prototype.hide = function() {
  this.container.classList.add('chat-collapsed')
  this.container.classList.remove('hidden')
  this.isVisible = false
  if (this.abortController) {
    this.cancelStream()
  }
}

ChatPanel.prototype.setActiveSkills = function(skills) {
  this.activeSkills = skills || []
}

ChatPanel.prototype.setAgentMode = function(mode) {
  this.agentMode = mode
  var modeDisplay = {
    'chat': '💬 Chat',
    'plan': '📋 Plan',
    'build': '🏗️ Build',
    'review': '🔍 Review',
    'debug': '🐛 Debug',
    'deploy': '🚀 Deploy'
  }
  var displayName = modeDisplay[mode] || mode
  this.addSystemMessage('Switched to **' + displayName + '** mode.')
}

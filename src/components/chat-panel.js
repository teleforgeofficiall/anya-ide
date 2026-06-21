function ChatPanel(getEditorContext) {
  this.getEditorContext = getEditorContext
  this.aiProvider = new AIProviderService()
  this.messages = []
  this.isProcessing = false
  this.isVisible = false
  this.providerConfigured = false
  this.customPrompt = ''
  this.abortController = null
  this.sessions = []
  this.currentSessionId = null

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

  this.modelSelect.onchange = function() {
    if (self.aiProvider.provider) {
      self.aiProvider.model = self.modelSelect.value
      self._saveProviderConfig()
    }
  }

  // Event delegation for code block buttons
  this.messagesEl.addEventListener('click', function(e) {
    var target = e.target.closest('.code-copy, .code-apply')
    if (!target) return
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
  })

  this.loadConfig()
  this.loadSessions()
}

ChatPanel.prototype.loadConfig = async function() {
  var self = this
  try {
    var result = await window.anya.config.read()
    if (result.success && result.config) {
      var cfg = result.config
      if (cfg.prompt) self.customPrompt = cfg.prompt
      if (cfg.aiProvider && cfg.aiProvider.provider) {
        var ap = cfg.aiProvider
        var needsKey = !self.aiProvider.getProviderInfo(ap.provider) || !self.aiProvider.getProviderInfo(ap.provider).local
        if (ap.provider && (ap.apiKey || !needsKey)) {
          self.aiProvider.setProvider(ap.provider, ap.apiKey || '', ap.model)
          self.aiProvider.setConfig({
            temperature: ap.temperature,
            maxTokens: ap.maxTokens,
            contextWindow: cfg.memory ? cfg.memory.contextWindow : 50
          })
          self.providerConfigured = true
          self._updateModelSelect()
        }
      }
    }
  } catch(e) {}
  if (!this.providerConfigured) {
    this.addSystemMessage('Welcome to AI Chat! ♥\nConfigure a provider in Settings to get started.')
  }
}

ChatPanel.prototype._updateModelSelect = function() {
  var info = this.aiProvider.getCurrentInfo()
  if (!info) return
  this.modelSelect.innerHTML = '<option value="' + AnyaHelpers.escapeHtml(info.model) + '">' + AnyaHelpers.escapeHtml(info.name + ' — ' + info.model) + '</option>'
  this.modelSelect.value = info.model
}

ChatPanel.prototype._saveProviderConfig = async function() {
  try {
    var result = await window.anya.config.read()
    if (result.success) {
      var cfg = result.config || {}
      if (!cfg.aiProvider) cfg.aiProvider = {}
      cfg.aiProvider.model = this.aiProvider.model
      await window.anya.config.write(cfg)
    }
  } catch(e) {}
}

ChatPanel.prototype.sendMessage = async function() {
  var self = this
  var text = this.inputEl.value.trim()
  if (!text || this.isProcessing) return

  if (!this.providerConfigured) {
    this.inputEl.value = ''
    this.addSystemMessage('Please configure an AI provider first. Go to Settings → AI Providers → select provider + enter API key.')
    return
  }

  this.inputEl.value = ''
  this.addMessage('user', text)

  this.isProcessing = true
  this.sendBtn.textContent = '■ Stop'
  this.sendBtn.style.background = 'var(--anya-error)'

  var ctx = this.getEditorContext()
  var fullMessages = []

  var systemPrompt = this.customPrompt || 'You are Anya, a helpful AI coding assistant. Be concise. Use markdown for formatting.'
  if (ctx && ctx.filePath) {
    systemPrompt += '\n\nCurrent file: ' + ctx.filePath + '\nLanguage: ' + ctx.language
    if (ctx.selectedText) {
      systemPrompt += '\n\nSelected code:\n```' + ctx.language + '\n' + ctx.selectedText + '\n```'
    }
    if (ctx.fileContent) {
      systemPrompt += '\n\nFile content:\n```' + (ctx.language || '') + '\n' + ctx.fileContent + '\n```'
    }
  }
  fullMessages.push({ role: 'system', content: systemPrompt })

  for (var i = 0; i < this.messages.length; i++) {
    fullMessages.push({ role: this.messages[i].role, content: this.messages[i].content })
  }

  var loadingEl = this.addLoading()

  this.abortController = new AbortController()
  var signal = this.abortController.signal

  try {
    var responseText = ''
    var startTime = Date.now()

    await this.aiProvider.sendMessage(fullMessages, function(partial) {
      responseText = partial
      var existing = self.messagesEl.querySelector('.chat-msg.streaming')
      if (existing) {
        var textEl = existing.querySelector('.chat-text')
        if (textEl) textEl.innerHTML = self.renderMarkdown(partial, true)
        self.messagesEl.scrollTop = self.messagesEl.scrollHeight
      }
    }, signal)

    loadingEl.classList.remove('streaming')
    var msgEl = self.addMessage('assistant', responseText, Date.now() - startTime)
    self._saveConversations()
  } catch (err) {
    if (err.name === 'AbortError') {
      loadingEl.remove()
      self.addSystemMessage('Response cancelled.')
    } else {
      loadingEl.remove()
      self.addMessage('error', 'Error: ' + err.message)
    }
  }

  this.isProcessing = false
  this.abortController = null
  this.sendBtn.textContent = 'Send'
  this.sendBtn.style.background = ''
}

ChatPanel.prototype.cancelStream = function() {
  if (this.abortController) {
    this.abortController.abort()
    this.abortController = null
  }
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
  return el
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
  this.container.classList.remove('chat-collapsed')
  this.isVisible = true
  // Force reflow for animation
  void this.container.offsetWidth
  var self = this
  setTimeout(function() { self.inputEl.focus() }, 150)
}

ChatPanel.prototype.hide = function() {
  this.container.classList.add('chat-collapsed')
  this.isVisible = false
  if (this.abortController) {
    this.cancelStream()
  }
}

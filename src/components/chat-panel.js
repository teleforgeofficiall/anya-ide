function ChatPanel(getEditorContext) {
  this.getEditorContext = getEditorContext
  this.aiProvider = new AIProviderService()
  this.messages = []
  this.isProcessing = false
  this.isVisible = false
  this.providerConfigured = false
  this.customPrompt = ''

  this.container = document.getElementById('chat-panel')
  this.messagesEl = document.getElementById('chat-messages')
  this.inputEl = document.getElementById('chat-input')
  this.sendBtn = document.getElementById('chat-send')

  this.init()
}

ChatPanel.prototype.init = function() {
  var self = this

  document.getElementById('chat-close').onclick = function() { self.hide() }

  this.sendBtn.onclick = function() { self.sendMessage() }
  this.inputEl.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      self.sendMessage()
    }
  })

  this.loadConfig()
}

ChatPanel.prototype.loadConfig = async function() {
  var self = this
  try {
    var result = await window.anya.config.read()
    if (result.success && result.config) {
      var cfg = result.config
      if (cfg.prompt) self.customPrompt = cfg.prompt
      if (cfg.aiProvider) {
        var ap = cfg.aiProvider
        if (ap.provider && ap.apiKey) {
          self.aiProvider.setProvider(ap.provider, ap.apiKey, ap.model)
          self.aiProvider.setConfig({
            temperature: ap.temperature,
            maxTokens: ap.maxTokens
          })
          self.providerConfigured = true
          var info = self.aiProvider.getCurrentInfo()
          if (info) {
            self.addSystemMessage('Welcome! Connected to ' + info.name + ' (' + info.model + ')')
            return
          }
        }
      }
    }
  } catch(e) {}
  self.addSystemMessage('Welcome to AI Chat! Configure a provider to get started.')
}

ChatPanel.prototype.configureProvider = function() {
  var self = this
  var providers = this.aiProvider.providers
  var optionsHtml = ''
  for (var id in providers) {
    if (providers.hasOwnProperty(id)) {
      optionsHtml += '<option value="' + id + '">' + providers[id].name + '</option>'
    }
  }

  var overlay = document.createElement('div')
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:5000'
  overlay.innerHTML =
    '<div style="background:var(--anya-bg-secondary);border:1px solid var(--anya-border-light);border-radius:8px;padding:24px;width:400px;max-width:90%">' +
      '<h3 style="color:var(--anya-primary);margin-bottom:16px;font-size:16px">♥ Configure AI Provider</h3>' +
      '<div style="margin-bottom:12px">' +
        '<label style="display:block;margin-bottom:4px;color:var(--anya-text-muted);font-size:12px">Provider</label>' +
        '<select id="config-provider" style="width:100%;padding:8px;background:var(--anya-bg);border:1px solid var(--anya-border);border-radius:4px;color:var(--anya-text);font-size:13px">' + optionsHtml + '</select>' +
      '</div>' +
      '<div style="margin-bottom:12px">' +
        '<label style="display:block;margin-bottom:4px;color:var(--anya-text-muted);font-size:12px">API Key</label>' +
        '<input id="config-key" type="password" placeholder="sk-..." style="width:100%;padding:8px;background:var(--anya-bg);border:1px solid var(--anya-border);border-radius:4px;color:var(--anya-text);font-size:13px;outline:none">' +
      '</div>' +
      '<div style="margin-bottom:16px">' +
        '<label style="display:block;margin-bottom:4px;color:var(--anya-text-muted);font-size:12px">Model</label>' +
        '<input id="config-model" type="text" placeholder="gpt-4o" style="width:100%;padding:8px;background:var(--anya-bg);border:1px solid var(--anya-border);border-radius:4px;color:var(--anya-text);font-size:13px;outline:none">' +
      '</div>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end">' +
        '<button id="config-cancel" style="padding:8px 16px;background:var(--anya-surface);border:1px solid var(--anya-border);border-radius:4px;color:var(--anya-text);cursor:pointer">Cancel</button>' +
        '<button id="config-save" style="padding:8px 16px;background:var(--anya-primary);border:none;border-radius:4px;color:white;cursor:pointer">Connect</button>' +
      '</div>' +
    '</div>'

  document.body.appendChild(overlay)

  var providerSelect = overlay.querySelector('#config-provider')
  var keyInput = overlay.querySelector('#config-key')
  var modelInput = overlay.querySelector('#config-model')

  providerSelect.onchange = function() {
    var cfg = self.aiProvider.getProviderInfo(providerSelect.value)
    if (cfg) {
      modelInput.placeholder = cfg.defaultModel
      modelInput.value = ''
      keyInput.placeholder = cfg.models.length === 0 && cfg.defaultModel === 'llama3.2' ? '(local)' : 'sk-...'
    }
  }
  providerSelect.dispatchEvent(new Event('change'))

  overlay.querySelector('#config-cancel').onclick = function() { overlay.remove() }
  overlay.querySelector('#config-save').onclick = function() {
    var provider = providerSelect.value
    var key = keyInput.value
    var model = modelInput.value || self.aiProvider.getProviderInfo(provider).defaultModel

    try {
      self.aiProvider.setProvider(provider, key, model)
      self.providerConfigured = true
      self.messages = []
      self.messagesEl.innerHTML = ''
      var info = self.aiProvider.getCurrentInfo()
      self.addSystemMessage('Connected to ' + info.name + ' (' + info.model + ')')
      overlay.remove()
    } catch (err) {
      alert(err.message)
    }
  }
}

ChatPanel.prototype.sendMessage = async function() {
  var self = this
  var text = this.inputEl.value.trim()
  if (!text || this.isProcessing) return

  if (!this.providerConfigured) {
    this.inputEl.value = ''
    this.addSystemMessage('Please configure an AI provider first. (AI > Configure Provider)')
    return
  }

  this.inputEl.value = ''
  this.addMessage('user', text)

  this.isProcessing = true
  this.sendBtn.disabled = true
  this.sendBtn.textContent = '...'

  var ctx = this.getEditorContext()
  var fullMessages = []

  var systemPrompt = this.customPrompt || 'You are Anya, a helpful AI coding assistant. Be concise.'
  if (ctx && ctx.filePath) {
    systemPrompt += '\n\nCurrent file: ' + ctx.filePath + '\nLanguage: ' + ctx.language
    if (ctx.selectedText) {
      systemPrompt += '\n\nSelected code:\n```' + ctx.language + '\n' + ctx.selectedText + '\n```'
    }
    if (ctx.fileContent) {
      systemPrompt += '\n\nFile content:\n```\n' + ctx.fileContent + '\n```'
    }
  }
  fullMessages.push({ role: 'system', content: systemPrompt })

  for (var i = 0; i < this.messages.length; i++) {
    fullMessages.push({ role: this.messages[i].role, content: this.messages[i].content })
  }

  var loadingEl = this.addLoading()

  try {
    var responseText = ''
    var startTime = Date.now()

    await this.aiProvider.sendMessage(fullMessages, function(partial) {
      responseText = partial
      var existing = self.messagesEl.querySelector('.chat-msg.streaming')
      if (existing) {
        var textEl = existing.querySelector('.chat-text')
        if (textEl) textEl.innerHTML = self.renderMarkdown(partial)
      }
    })

    loadingEl.remove()
    self.addMessage('assistant', responseText, Date.now() - startTime)
  } catch (err) {
    loadingEl.remove()
    self.addMessage('error', 'Error: ' + err.message)
  }

  this.isProcessing = false
  this.sendBtn.disabled = false
  this.sendBtn.textContent = 'Send'
}

ChatPanel.prototype.addMessage = function(role, content, timing) {
  var el = document.createElement('div')
  el.className = 'chat-msg ' + role
  var textEl = document.createElement('div')
  textEl.className = 'chat-text'
  if (role === 'assistant') {
    textEl.innerHTML = this.renderMarkdown(content)
  } else {
    textEl.textContent = content
  }
  el.appendChild(textEl)
  if (timing) {
    var timingEl = document.createElement('div')
    timingEl.className = 'chat-timing'
    timingEl.textContent = 'Thought: ' + timing + 'ms'
    el.appendChild(timingEl)
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
  el.innerHTML = '<span class="spinner"></span> Thinking...'
  this.messagesEl.appendChild(el)
  this.messagesEl.scrollTop = this.messagesEl.scrollHeight
  return el
}

ChatPanel.prototype.renderMarkdown = function(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/```(\w*)\n([\s\S]*?)```/g, function(m, lang, code) {
      return '<pre style="background:var(--anya-bg);padding:8px;border-radius:4px;overflow-x:auto;font-size:11px;margin:4px 0"><code>' + AnyaHelpers.escapeHtml(code) + '</code></pre>'
    })
    .replace(/`([^`]+)`/g, '<code style="background:var(--anya-bg);padding:1px 4px;border-radius:3px;font-size:11px">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>')
}

ChatPanel.prototype.toggle = function() {
  if (this.isVisible) this.hide()
  else this.show()
}

ChatPanel.prototype.show = function() {
  this.container.classList.remove('hidden')
  this.isVisible = true
  var self = this
  setTimeout(function() { self.inputEl.focus() }, 100)
}

ChatPanel.prototype.hide = function() {
  this.container.classList.add('hidden')
  this.isVisible = false
}

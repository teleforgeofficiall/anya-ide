function AIProviderService() {
  this.provider = null
  this.model = null
  this.apiKey = null
  this.providers = {
    openai: {
      name: 'OpenAI', defaultModel: 'gpt-4o',
      endpoint: 'https://api.openai.com/v1/chat/completions',
      models: ['gpt-4o', 'gpt-4o-mini', 'o3-mini', 'gpt-4-turbo']
    },
    anthropic: {
      name: 'Anthropic', defaultModel: 'claude-sonnet-4-20250514',
      endpoint: 'https://api.anthropic.com/v1/messages',
      models: ['claude-sonnet-4-20250514', 'claude-opus-4-20250514', 'claude-haiku-3-5']
    },
    google: {
      name: 'Google Gemini', defaultModel: 'gemini-2.5-flash',
      endpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
      models: ['gemini-2.5-flash', 'gemini-2.5-pro']
    },
    openrouter: {
      name: 'OpenRouter', defaultModel: 'openai/gpt-4o',
      endpoint: 'https://openrouter.ai/api/v1/chat/completions',
      models: []
    },
    deepseek: {
      name: 'DeepSeek', defaultModel: 'deepseek-chat',
      endpoint: 'https://api.deepseek.com/v1/chat/completions',
      models: ['deepseek-chat', 'deepseek-reasoner']
    },
    groq: {
      name: 'Groq', defaultModel: 'llama-3.3-70b-versatile',
      endpoint: 'https://api.groq.com/openai/v1/chat/completions',
      models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768']
    },
    mistral: {
      name: 'Mistral AI', defaultModel: 'mistral-large-latest',
      endpoint: 'https://api.mistral.ai/v1/chat/completions',
      models: ['mistral-large-latest', 'mistral-small-latest', 'codestral-latest']
    },
    xai: {
      name: 'xAI', defaultModel: 'grok-2',
      endpoint: 'https://api.x.ai/v1/chat/completions',
      models: ['grok-2', 'grok-2-mini']
    },
    together: {
      name: 'Together AI', defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
      endpoint: 'https://api.together.xyz/v1/chat/completions',
      models: ['meta-llama/Llama-3.3-70B-Instruct-Turbo']
    },
    ollama: {
      name: 'Ollama (Local)', defaultModel: 'llama3.2',
      endpoint: 'http://localhost:11434/api/chat',
      models: [], local: true
    }
  }
}

AIProviderService.prototype.setProvider = function(providerId, apiKey, model) {
  var cfg = this.providers[providerId]
  if (!cfg) throw new Error('Unknown provider: ' + providerId)
  this.provider = providerId
  this.apiKey = apiKey
  this.model = model || cfg.defaultModel
}

AIProviderService.prototype.getProviderInfo = function(providerId) {
  return this.providers[providerId] || null
}

AIProviderService.prototype.getCurrentInfo = function() {
  if (!this.provider) return null
  var cfg = this.providers[this.provider]
  return { id: this.provider, name: cfg.name, model: this.model }
}

AIProviderService.prototype.sendMessage = async function(messages, onStream) {
  if (!this.provider) throw new Error('No AI provider configured')
  var cfg = this.providers[this.provider]

  if (this.provider === 'ollama') return this._sendOllama(messages, onStream, cfg)
  if (this.provider === 'anthropic') return this._sendAnthropic(messages, onStream, cfg)
  if (this.provider === 'google') return this._sendGoogle(messages, onStream, cfg)
  return this._sendOpenAICompatible(messages, onStream, cfg)
}

AIProviderService.prototype._sendOpenAICompatible = async function(messages, onStream, cfg) {
  var body = JSON.stringify({
    model: this.model,
    messages: messages.map(function(m) { return { role: m.role, content: m.content } }),
    stream: !!onStream
  })

  var headers = {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + this.apiKey
  }

  if (onStream) return this._streamSSE(cfg.endpoint, headers, body, onStream)

  var res = await fetch(cfg.endpoint, { method: 'POST', headers: headers, body: body })
  if (!res.ok) throw new Error('API error: ' + res.status)
  var data = await res.json()
  return data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : ''
}

AIProviderService.prototype._sendAnthropic = async function(messages, onStream, cfg) {
  var systemMsg = null
  var chatMsgs = []
  for (var i = 0; i < messages.length; i++) {
    if (messages[i].role === 'system') systemMsg = messages[i].content
    else chatMsgs.push({ role: messages[i].role === 'assistant' ? 'assistant' : 'user', content: messages[i].content })
  }

  var body = {
    model: this.model,
    messages: chatMsgs,
    max_tokens: 4096,
    stream: !!onStream
  }
  if (systemMsg) body.system = systemMsg

  var headers = {
    'Content-Type': 'application/json',
    'x-api-key': this.apiKey,
    'anthropic-version': '2023-06-01'
  }

  if (onStream) return this._streamAnthropic(cfg.endpoint, headers, JSON.stringify(body), onStream)

  var res = await fetch(cfg.endpoint, { method: 'POST', headers: headers, body: JSON.stringify(body) })
  if (!res.ok) throw new Error('API error: ' + res.status)
  var data = await res.json()
  return data.content && data.content[0] ? data.content[0].text : ''
}

AIProviderService.prototype._sendGoogle = async function(messages, onStream, cfg) {
  var chatMsgs = []
  for (var i = 0; i < messages.length; i++) {
    if (messages[i].role === 'system') continue
    chatMsgs.push({ role: messages[i].role === 'assistant' ? 'model' : 'user', parts: [{ text: messages[i].content }] })
  }

  var url = cfg.endpoint + '/' + this.model + ':streamGenerateContent?key=' + this.apiKey + '&alt=sse'
  var body = JSON.stringify({ contents: chatMsgs })

  if (onStream) return this._streamGoogle(url, body, onStream)

  var res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body })
  if (!res.ok) throw new Error('API error: ' + res.status)
  var data = await res.json()
  return data.candidates && data.candidates[0] && data.candidates[0].content ? data.candidates[0].content.parts[0].text : ''
}

AIProviderService.prototype._sendOllama = async function(messages, onStream, cfg) {
  var body = JSON.stringify({
    model: this.model,
    messages: messages.map(function(m) { return { role: m.role, content: m.content } }),
    stream: !!onStream
  })

  if (onStream) {
    var res = await fetch(cfg.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body })
    if (!res.ok) throw new Error('Ollama error: ' + res.status)
    var reader = res.body.getReader()
    var decoder = new TextDecoder()
    var full = ''

    while (true) {
      var result = await reader.read()
      if (result.done) break
      var lines = decoder.decode(result.value).split('\n').filter(function(l) { return l.trim() })
      for (var j = 0; j < lines.length; j++) {
        try {
          var d = JSON.parse(lines[j])
          if (d.message && d.message.content) {
            full += d.message.content
            onStream(full)
          }
        } catch(e) {}
      }
    }
    return full
  }

  var res = await fetch(cfg.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: this.model, messages: messages, stream: false }) })
  if (!res.ok) throw new Error('Ollama error: ' + res.status)
  var data = await res.json()
  return data.message ? data.message.content : ''
}

AIProviderService.prototype._streamSSE = async function(url, headers, body, onStream) {
  var res = await fetch(url, { method: 'POST', headers: headers, body: body })
  if (!res.ok) throw new Error('API error: ' + res.status)

  var reader = res.body.getReader()
  var decoder = new TextDecoder()
  var full = ''
  var buffer = ''

  while (true) {
    var result = await reader.read()
    if (result.done) break

    buffer += decoder.decode(result.value, { stream: true })
    var lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (var i = 0; i < lines.length; i++) {
      var t = lines[i].trim()
      if (!t || !t.startsWith('data: ')) continue
      var json = t.slice(6)
      if (json === '[DONE]') continue
      try {
        var d = JSON.parse(json)
        var delta = ''
        if (d.choices && d.choices[0]) {
          delta = d.choices[0].delta ? (d.choices[0].delta.content || '') : (d.choices[0].text || '')
        }
        if (delta) {
          full += delta
          onStream(full)
        }
      } catch(e) {}
    }
  }
  return full
}

AIProviderService.prototype._streamAnthropic = async function(url, headers, body, onStream) {
  var res = await fetch(url, { method: 'POST', headers: headers, body: body })
  if (!res.ok) throw new Error('API error: ' + res.status)

  var reader = res.body.getReader()
  var decoder = new TextDecoder()
  var full = ''
  var buffer = ''

  while (true) {
    var result = await reader.read()
    if (result.done) break

    buffer += decoder.decode(result.value, { stream: true })
    var lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (var i = 0; i < lines.length; i++) {
      var t = lines[i].trim()
      if (!t.startsWith('data: ')) continue
      try {
        var d = JSON.parse(t.slice(6))
        if (d.type === 'content_block_delta' && d.delta && d.delta.text) {
          full += d.delta.text
          onStream(full)
        }
      } catch(e) {}
    }
  }
  return full
}

AIProviderService.prototype._streamGoogle = async function(url, body, onStream) {
  var res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body })
  if (!res.ok) throw new Error('API error: ' + res.status)

  var reader = res.body.getReader()
  var decoder = new TextDecoder()
  var full = ''
  var buffer = ''

  while (true) {
    var result = await reader.read()
    if (result.done) break

    buffer += decoder.decode(result.value, { stream: true })
    var lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (var i = 0; i < lines.length; i++) {
      var t = lines[i].trim()
      if (!t.startsWith('data: ')) continue
      try {
        var d = JSON.parse(t.slice(6))
        var text = ''
        if (d.candidates && d.candidates[0] && d.candidates[0].content) {
          text = d.candidates[0].content.parts ? d.candidates[0].content.parts[0].text : ''
        }
        if (text) {
          full += text
          onStream(full)
        }
      } catch(e) {}
    }
  }
  return full
}

function AIProviderService() {
  this.provider = null
  this.model = null
  this.apiKey = null
  this.temperature = 0.7
  this.maxTokens = 4096
  this.contextWindow = 50
  this.requestCounter = 0
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

AIProviderService.prototype.setConfig = function(config) {
  if (config.temperature != null) this.temperature = parseFloat(config.temperature) || 0.7
  if (config.maxTokens != null) this.maxTokens = parseInt(config.maxTokens) || 4096
  if (config.contextWindow != null) this.contextWindow = parseInt(config.contextWindow) || 50
}

AIProviderService.prototype.getProviderInfo = function(providerId) {
  return this.providers[providerId] || null
}

AIProviderService.prototype.getCurrentInfo = function() {
  if (!this.provider) return null
  var cfg = this.providers[this.provider]
  return { id: this.provider, name: cfg.name, model: this.model }
}

AIProviderService.prototype._fetch = async function(url, opts) {
  if (typeof window.anya !== 'undefined' && window.anya.ai && window.anya.ai.proxy) {
    var requestId = 'ai-' + (++this.requestCounter)
    var proxyOpts = {
      url: url,
      method: opts.method || 'GET',
      headers: opts.headers || {},
      requestId: requestId
    }
    if (opts.body) proxyOpts.body = opts.body
    if (opts.signal) {
      opts.signal.addEventListener('abort', function() {
        window.anya.ai.abort(requestId)
      })
    }

    var result = await window.anya.ai.proxy(proxyOpts)
    if (!result.success) {
      if (result.aborted) throw new DOMException('The user aborted a request.', 'AbortError')
      throw new Error(result.error || 'Request failed')
    }
    return {
      ok: result.status >= 200 && result.status < 300,
      status: result.status,
      headers: result.headers,
      body: result.body,
      text: function() { return Promise.resolve(result.body) },
      json: function() { try { return Promise.resolve(JSON.parse(result.body)) } catch(e) { return Promise.reject(e) } }
    }
  }
  return fetch(url, opts)
}

AIProviderService.prototype._fetchStream = async function(url, opts, onChunk, signal) {
  if (typeof window.anya !== 'undefined' && window.anya.ai && window.anya.ai.proxy) {
    var requestId = 'ai-' + (++this.requestCounter)
    var proxyOpts = {
      url: url,
      method: opts.method || 'POST',
      headers: opts.headers || {},
      body: opts.body,
      requestId: requestId,
      stream: true
    }
    if (signal) {
      signal.addEventListener('abort', function() {
        window.anya.ai.abort(requestId)
      })
    }

    var result = await window.anya.ai.proxy(proxyOpts)
    if (!result.success) {
      if (result.aborted) throw new DOMException('The user aborted a request.', 'AbortError')
      throw new Error(result.error || 'Request failed')
    }

    // When proxy is used, the response comes as a single body
    // Parse SSE/NDJSON from it
    var body = result.body
    var lines = body.split('\n')
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim()
      if (!line) continue
      if (line.startsWith('data: ')) line = line.slice(6)
      try {
        var d = JSON.parse(line)
        onChunk(d)
      } catch(e) {}
    }
    return result.body
  }
  return this._fetchStreamDirect(url, opts, onChunk)
}

AIProviderService.prototype._fetchStreamDirect = async function(url, opts, onChunk) {
  var res = await fetch(url, opts)
  if (!res.ok) {
    var errText = await res.text().catch(function(){return ''})
    throw new Error('API error: ' + res.status + (errText ? ' - ' + errText.slice(0, 100) : ''))
  }
  var reader = res.body.getReader()
  var decoder = new TextDecoder()
  var buffer = ''

  while (true) {
    var readResult = await reader.read()
    if (readResult.done) break
    buffer += decoder.decode(readResult.value, { stream: true })
    var lns = buffer.split('\n')
    buffer = lns.pop() || ''
    for (var j = 0; j < lns.length; j++) {
      var t = lns[j].trim()
      if (!t) continue
      if (t.startsWith('data: ')) t = t.slice(6)
      try {
        var d = JSON.parse(t)
        onChunk(d)
      } catch(e) {
        // Partial JSON, wait for more data
      }
    }
  }
}

AIProviderService.prototype.sendMessage = async function(messages, onStream, signal) {
  if (!this.provider) throw new Error('No AI provider configured')

  // Enforce context window
  if (this.contextWindow > 0 && messages.length > this.contextWindow + 1) {
    var systemMsgs = messages.filter(function(m) { return m.role === 'system' })
    var chatMsgs = messages.filter(function(m) { return m.role !== 'system' })
    var keep = this.contextWindow - systemMsgs.length
    if (keep > 0 && chatMsgs.length > keep) {
      chatMsgs = chatMsgs.slice(-keep)
    }
    messages = systemMsgs.concat(chatMsgs)
  }

  var cfg = this.providers[this.provider]

  if (this.provider === 'ollama') return this._sendOllama(messages, onStream, cfg, signal)
  if (this.provider === 'anthropic') return this._sendAnthropic(messages, onStream, cfg, signal)
  if (this.provider === 'google') return this._sendGoogle(messages, onStream, cfg, signal)
  return this._sendOpenAICompatible(messages, onStream, cfg, signal)
}

AIProviderService.prototype._sendOpenAICompatible = async function(messages, onStream, cfg, signal) {
  var bodyObj = {
    model: this.model,
    messages: messages.map(function(m) { return { role: m.role, content: m.content } }),
    temperature: this.temperature,
    max_tokens: this.maxTokens,
    stream: !!onStream
  }
  if (this.provider === 'openrouter') {
    delete bodyObj.temperature
  }
  var body = JSON.stringify(bodyObj)

  var headers = {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + this.apiKey
  }

  if (onStream) {
    return this._streamSSE(cfg.endpoint, headers, body, onStream, signal)
  }

  var res = await this._fetch(cfg.endpoint, {
    method: 'POST', headers: headers, body: body, signal: signal
  })
  if (!res.ok) {
    var errText = await res.text().catch(function(){return ''})
    throw new Error('API error: ' + res.status + (errText ? ' - ' + errText.slice(0, 200) : ''))
  }
  var data = await res.json()
  return data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : ''
}

AIProviderService.prototype._sendAnthropic = async function(messages, onStream, cfg, signal) {
  var systemMsg = null
  var chatMsgs = []
  for (var i = 0; i < messages.length; i++) {
    if (messages[i].role === 'system') systemMsg = messages[i].content
    else chatMsgs.push({ role: messages[i].role === 'assistant' ? 'assistant' : 'user', content: messages[i].content })
  }

  var body = {
    model: this.model,
    messages: chatMsgs,
    max_tokens: this.maxTokens,
    temperature: this.temperature,
    stream: !!onStream
  }
  if (systemMsg) body.system = systemMsg

  var headers = {
    'Content-Type': 'application/json',
    'x-api-key': this.apiKey,
    'anthropic-version': '2023-06-01'
  }

  if (onStream) return this._streamAnthropic(cfg.endpoint, headers, JSON.stringify(body), onStream, signal)

  var res = await this._fetch(cfg.endpoint, {
    method: 'POST', headers: headers, body: JSON.stringify(body), signal: signal
  })
  if (!res.ok) {
    var errText = await res.text().catch(function(){return ''})
    throw new Error('API error: ' + res.status + (errText ? ' - ' + errText.slice(0, 200) : ''))
  }
  var data = await res.json()
  return data.content && data.content[0] ? data.content[0].text : ''
}

AIProviderService.prototype._sendGoogle = async function(messages, onStream, cfg, signal) {
  var systemInstruction = null
  var chatMsgs = []
  for (var i = 0; i < messages.length; i++) {
    if (messages[i].role === 'system') {
      systemInstruction = messages[i].content
      continue
    }
    chatMsgs.push({ role: messages[i].role === 'assistant' ? 'model' : 'user', parts: [{ text: messages[i].content }] })
  }

  var streamUrl = cfg.endpoint + '/' + this.model + ':streamGenerateContent?key=' + this.apiKey + '&alt=sse'
  var nonStreamUrl = cfg.endpoint + '/' + this.model + ':generateContent?key=' + this.apiKey

  var bodyObj = { contents: chatMsgs }
  if (systemInstruction) {
    bodyObj.systemInstruction = { parts: [{ text: systemInstruction }] }
  }
  var body = JSON.stringify(bodyObj)

  if (onStream) return this._streamGoogle(streamUrl, body, onStream, signal)

  var res = await this._fetch(nonStreamUrl, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, signal: signal
  })
  if (!res.ok) {
    var errText = await res.text().catch(function(){return ''})
    throw new Error('API error: ' + res.status + (errText ? ' - ' + errText.slice(0, 200) : ''))
  }
  var data = await res.json()
  return data.candidates && data.candidates[0] && data.candidates[0].content ? data.candidates[0].content.parts[0].text : ''
}

AIProviderService.prototype._sendOllama = async function(messages, onStream, cfg, signal) {
  var body = JSON.stringify({
    model: this.model,
    messages: messages.map(function(m) { return { role: m.role, content: m.content } }),
    stream: !!onStream
  })

  if (onStream) {
    return this._streamOllama(cfg.endpoint, body, onStream, signal)
  }

  var res = await this._fetch(cfg.endpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      model: this.model, messages: messages, stream: false
    }), signal: signal
  })
  if (!res.ok) {
    var errText = await res.text().catch(function(){return ''})
    throw new Error('Ollama error: ' + res.status + (errText ? ' - ' + errText.slice(0, 200) : ''))
  }
  var data = await res.json()
  return data.message ? data.message.content : ''
}

AIProviderService.prototype._streamSSE = async function(url, headers, body, onStream, signal) {
  var full = ''
  var handler = function(d) {
    var delta = ''
    if (d.choices && d.choices[0]) {
      delta = d.choices[0].delta ? (d.choices[0].delta.content || '') : (d.choices[0].text || '')
    }
    if (delta) {
      full += delta
      onStream(full)
    }
  }
  await this._fetchStream(url, { method: 'POST', headers: headers, body: body, signal: signal }, handler, signal)
  return full
}

AIProviderService.prototype._streamAnthropic = async function(url, headers, body, onStream, signal) {
  var full = ''
  var handler = function(d) {
    if (d.type === 'content_block_delta' && d.delta && d.delta.text) {
      full += d.delta.text
      onStream(full)
    }
  }
  await this._fetchStream(url, { method: 'POST', headers: headers, body: body, signal: signal }, handler, signal)
  return full
}

AIProviderService.prototype._streamGoogle = async function(url, body, onStream, signal) {
  var full = ''
  var handler = function(d) {
    if (d.candidates && d.candidates[0] && d.candidates[0].content) {
      var text = d.candidates[0].content.parts ? d.candidates[0].content.parts[0].text : ''
      if (text) {
        full += text
        onStream(full)
      }
    }
  }
  await this._fetchStream(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, signal: signal }, handler, signal)
  return full
}

AIProviderService.prototype._streamOllama = async function(url, body, onStream, signal) {
  var full = ''
  var handler = function(d) {
    if (d.message && d.message.content) {
      full += d.message.content
      onStream(full)
    }
  }
  await this._fetchStream(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, signal: signal }, handler, signal)
  return full
}

function AIProviderService() {
  this.provider = null
  this.model = null
  this.apiKey = null
  this.temperature = 0.7
  this.maxTokens = 4096
  this.contextWindow = 50
  this.requestCounter = 0
  this.streamCleanup = null
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
      models: [],
      modelsLive: [],
      modelsFetchedAt: 0
    },
    opencode: {
      name: 'OpenCode', defaultModel: 'opencode/default',
      endpoint: 'http://localhost:4096',
      models: ['opencode/default'],
      modelsLive: [],
      modelsFetchedAt: 0,
      local: true
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
        if (window.anya.ai.abort) window.anya.ai.abort(requestId)
      })
    }

    // Listen for streaming chunks
    var buffer = ''
    var cleanup = null
    var resolved = false
    var streamPromise = new Promise(function(resolve, reject) {
      try {
        cleanup = window.anya.ai.onStreamChunk(function(data) {
          if (data.requestId !== requestId) return
          if (data.done) {
            // Flush remaining partial line in buffer
            if (buffer.trim()) {
              var line = buffer.trim()
              if (line.startsWith('data: ')) line = line.slice(6)
              if (line !== '[DONE]') {
                try {
                  var d = JSON.parse(line)
                  onChunk(d)
                } catch(e) {}
              }
            }
            if (!resolved) {
              resolved = true
              resolve(data.fullText || '')
            }
            return
          }
          // Accumulate raw text into buffer, process complete lines
          buffer += data.chunk
          var lines = buffer.split('\n')
          // Keep last (possibly incomplete) line in buffer
          buffer = lines.pop() || ''
          for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim()
            if (!line) continue
            if (line.startsWith('data: ')) line = line.slice(6)
            if (line === '[DONE]') continue
            try {
              var d = JSON.parse(line)
              onChunk(d)
            } catch(e) {}
          }
        })

        // Start the proxy request
        window.anya.ai.proxy(proxyOpts).then(function(result) {
          if (!result.success) {
            if (result.aborted) {
              reject(new DOMException('The user aborted a request.', 'AbortError'))
            } else {
              reject(new Error(result.error || 'Request failed'))
            }
            return
          }
          // If stream was not handled via events, process the body
          if (!result.streamed && result.body) {
            var body = result.body
            var lines = body.split('\n')
            for (var i = 0; i < lines.length; i++) {
              var line = lines[i].trim()
              if (!line) continue
              if (line.startsWith('data: ')) line = line.slice(6)
              if (line === '[DONE]') continue
              try {
                var d = JSON.parse(line)
                onChunk(d)
              } catch(e) {}
            }
            if (!resolved) {
              resolved = true
              resolve(body)
            }
          }
        }).catch(function(err) {
          if (!resolved) {
            resolved = true
            reject(err)
          }
        })
      } catch (e) {
        if (!resolved) {
          resolved = true
          reject(e)
        }
      }
    })

    try {
      var result = await streamPromise
      return result
    } finally {
      if (cleanup) cleanup()
    }
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
  // Flush remaining buffer after loop
  if (buffer.trim()) {
    var t = buffer.trim()
    if (t.startsWith('data: ')) t = t.slice(6)
    try {
      var d = JSON.parse(t)
      onChunk(d)
    } catch(e) {}
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
  if (this.provider === 'opencode') return this._sendOpenCode(messages, onStream, cfg, signal)
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
    var e = new Error('API error: ' + res.status + (errText ? ' - ' + errText.slice(0, 200) : ''))
    e.status = res.status
    e.rawBody = errText
    throw e
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

AIProviderService.prototype._sendOpenCode = async function(messages, onStream, cfg, signal) {
  // OpenCode local server protocol:
  // 1. POST /tui/append-prompt with { text: messages content }
  // 2. POST /tui/submit-prompt to trigger response
  var text = messages.map(function(m) { return m.content }).join('\n')
  var baseUrl = cfg.endpoint || 'http://localhost:4096'

  // Quick connection check first
  try {
    var checkRes = await this._fetch(baseUrl + '/doc', { method: 'GET' })
    if (!checkRes.ok) {
      throw new Error('OpenCode server returned status ' + checkRes.status)
    }
  } catch (checkErr) {
    if (checkErr.name === 'AbortError') throw checkErr
    throw new Error('Cannot connect to OpenCode at ' + baseUrl + '. Is the server running? (opencode serve --port 4096)')
  }

  // Create a combined abort controller for timeout + user abort
  var timeoutCtrl = new AbortController()
  var timeoutId = setTimeout(function() { timeoutCtrl.abort() }, 120000) // 2 min timeout
  if (signal) {
    signal.addEventListener('abort', function() { timeoutCtrl.abort(); clearTimeout(timeoutId) })
  }
  var combinedSignal = timeoutCtrl.signal

  // Append prompt
  var appendRes
  try {
    appendRes = await this._fetch(baseUrl + '/tui/append-prompt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text }),
      signal: combinedSignal
    })
  } catch (appendErr) {
    clearTimeout(timeoutId)
    if (appendErr.name === 'AbortError') throw new DOMException('Request timed out. The OpenCode server is not responding.', 'AbortError')
    throw appendErr
  }
  if (!appendRes.ok) {
    clearTimeout(timeoutId)
    var errText = await appendRes.text().catch(function(){return ''})
    throw new Error('OpenCode append error: HTTP ' + appendRes.status + (errText ? ' - ' + errText.slice(0, 100) : ''))
  }

  // Submit and get response
  var submitRes
  try {
    submitRes = await this._fetch(baseUrl + '/tui/submit-prompt', {
      method: 'POST',
      signal: combinedSignal
    })
  } catch (submitErr) {
    clearTimeout(timeoutId)
    if (submitErr.name === 'AbortError') throw new DOMException('Response generation timed out. The AI model may be too slow.', 'AbortError')
    throw submitErr
  }
  clearTimeout(timeoutId)

  if (!submitRes.ok) {
    var errText2 = await submitRes.text().catch(function(){return ''})
    throw new Error('OpenCode submit error: HTTP ' + submitRes.status + (errText2 ? ' - ' + errText2.slice(0, 100) : ''))
  }

  var fullText = await submitRes.text()
  if (onStream) {
    onStream(fullText)
  }
  return fullText
}

// -------------------------------------------------------------------
// Live model fetching
// -------------------------------------------------------------------

// Fetch models live from provider. Returns { success, models, error, status, raw }
AIProviderService.prototype.fetchLiveModels = async function(providerId, apiKey) {
  var self = this
  if (providerId === 'openrouter') {
    if (typeof window === 'undefined' || !window.anya || !window.anya.ai || !window.anya.ai.fetchOpenRouterModels) {
      return { success: false, error: 'Bridge unavailable' }
    }
    var result = await window.anya.ai.fetchOpenRouterModels(apiKey || '')
    if (!result.success) {
      return { success: false, status: result.status || 0, error: result.error, raw: result.rawBody || '' }
    }
    var cfg = self.providers.openrouter
    cfg.modelsLive = (result.models || []).map(function(m) {
      return {
        id: m.id,
        name: m.name || m.id,
        context: m.context_length || 0,
        pricing: m.pricing || {},
        top_provider: m.top_provider || {},
        architecture: m.architecture || {}
      }
    })
    cfg.modelsFetchedAt = Date.now()
    return { success: true, models: cfg.modelsLive }
  }
  if (providerId === 'opencode') {
    // OpenCode connects to a local server
    try {
      var ocfg = self.providers.opencode
      var baseUrl = ocfg.endpoint || 'http://localhost:4096'
      var res = await self._fetch(baseUrl + '/config/providers', {
        method: 'GET'
      })
      if (!res.ok) {
        // Fallback to /provider endpoint
        var res2 = await self._fetch(baseUrl + '/provider', {
          method: 'GET'
        })
        if (!res2.ok) {
          return { success: false, status: res2.status, error: 'OpenCode server not responding at ' + baseUrl }
        }
        var data2 = await res2.json()
        var models2 = []
        var allProviders = data2.all || []
        for (var pi = 0; pi < allProviders.length; pi++) {
          var prov = allProviders[pi]
          if (prov.models) {
            for (var modelId in prov.models) {
              if (prov.models.hasOwnProperty(modelId)) {
                var md = prov.models[modelId]
                models2.push({
                  id: prov.id + '/' + modelId,
                  name: md.name || modelId,
                  context: md.contextLength || '',
                  pricing: { prompt: '0', completion: '0' }
                })
              }
            }
          }
        }
        ocfg.modelsLive = models2
        ocfg.modelsFetchedAt = Date.now()
        return { success: true, models: models2 }
      }
      var data = await res.json()
      var models = []
      var providers = data.providers || data || []
      for (var pi = 0; pi < providers.length; pi++) {
        var p = providers[pi]
        var pName = p.id || p.name || 'unknown'
        if (p.models) {
          for (var modelId in p.models) {
            if (p.models.hasOwnProperty(modelId)) {
              var m = p.models[modelId]
              models.push({
                id: pName + '/' + modelId,
                name: m.name || modelId,
                context: m.contextLength || '',
                pricing: { prompt: '0', completion: '0' }
              })
            }
          }
        }
      }
      ocfg.modelsLive = models
      ocfg.modelsFetchedAt = Date.now()
      return { success: true, models: models }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }
  if (providerId === 'ollama') {
    if (typeof window === 'undefined' || !window.anya || !window.anya.ai || !window.anya.ai.fetchOllamaModels) {
      return { success: false, error: 'Bridge unavailable' }
    }
    var r = await window.anya.ai.fetchOllamaModels()
    if (!r.success) return { success: false, status: r.status || 0, error: r.error }
    var ocfg = self.providers.ollama
    ocfg.modelsLive = (r.models || []).map(function(m) { return { id: m.name, name: m.name, size: m.size } })
    ocfg.modelsFetchedAt = Date.now()
    return { success: true, models: ocfg.modelsLive }
  }
  return { success: false, error: 'Live fetch not supported for ' + providerId }
}

// Returns cached or static models for a provider
AIProviderService.prototype.getModels = function(providerId) {
  var cfg = this.providers[providerId]
  if (!cfg) return []
  if (cfg.modelsLive && cfg.modelsLive.length) return cfg.modelsLive
  if (cfg.models && cfg.models.length) return cfg.models.map(function(m) { return { id: m, name: m } })
  return []
}

// Classify a model as free or paid based on pricing strings.
// OpenRouter uses "0" for free, otherwise a USD-per-token string.
AIProviderService.prototype.classifyPricing = function(model) {
  if (!model || !model.pricing) return 'unknown'
  var p = parseFloat(model.pricing.prompt)
  var c = parseFloat(model.pricing.completion)
  if (isNaN(p) || isNaN(c)) return 'unknown'
  if (p === 0 && c === 0) return 'free'
  return 'paid'
}

// -------------------------------------------------------------------
// Structured error normalization
// -------------------------------------------------------------------

// Map an error (from _fetch or thrown) into { provider, model, code, raw, fix }
AIProviderService.prototype.normalizeError = function(err, providerId, modelId) {
  var cfg = this.providers[providerId]
  var providerName = cfg ? cfg.name : (providerId || 'Unknown')
  var raw = ''
  var code = 0

  if (err && typeof err === 'object') {
    if (err.status) code = err.status
    raw = err.message || err.error || err.rawBody || JSON.stringify(err)
  } else {
    raw = String(err)
  }

  // Try to extract HTTP status from the message (e.g. "API error: 401 - ...")
  if (!code) {
    var m = /(\b(?:[1-5]\d\d)\b)/.exec(raw)
    if (m) code = parseInt(m[1], 10)
  }

  var fix = ''
  switch (code) {
    case 401: fix = 'Your API key is invalid or missing. Update it in Settings.'; break
    case 402: fix = 'Insufficient credits. Add funds to your account or switch to a free model.'; break
    case 403: fix = 'Access forbidden. Your key may lack permission for this model.'; break
    case 404: fix = 'Model not found. Pick another model from the dropdown.'; break
    case 408: fix = 'Request timed out. Try again or increase timeout.'; break
    case 429: fix = 'Rate limit hit. Wait a few seconds and retry, or switch model.'; break
    case 500: fix = 'Provider server error. Try again in a moment.'; break
    case 502: fix = 'Provider bad gateway. Try again shortly.'; break
    case 503: fix = 'Provider unavailable. Try again later or pick another model.'; break
    case 0:   fix = 'Network error. Check your internet connection and proxy settings.'; break
    default:  fix = 'Verify provider, model, and API key in Settings.'
  }

  return {
    provider: providerName,
    model: modelId || (cfg ? cfg.defaultModel : ''),
    code: code || 0,
    raw: raw.slice(0, 500),
    fix: fix
  }
}

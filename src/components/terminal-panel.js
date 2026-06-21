function TerminalPanel() {
  this.container = document.getElementById('terminal-container')
  this.terminals = []
  this.activeTerminalId = null
  this.isVisible = false
  this.xtermReady = false

  this.loadXterm()
}

TerminalPanel.prototype.loadXterm = function() {
  var self = this

  var cssLink = document.createElement('link')
  cssLink.rel = 'stylesheet'
  cssLink.href = '../node_modules/@xterm/xterm/css/xterm.css'
  document.head.appendChild(cssLink)

  self.xtermReady = true
  self.createTerminal()
}

TerminalPanel.prototype.createTerminal = function() {
  if (!this.xtermReady) return
  var self = this

  var id = Date.now()
  var term = new Terminal({
    cursorBlink: true,
    cursorStyle: 'bar',
    fontSize: 13,
    fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', 'Consolas', monospace",
    theme: {
      background: '#1a1019', foreground: '#f0e6ec', cursor: '#FF69B4',
      selection: 'rgba(255,105,180,0.25)',
      black: '#1a1019', red: '#F44336', green: '#4CAF50', yellow: '#FF9800',
      blue: '#2196F3', magenta: '#FF69B4', cyan: '#00BCD4', white: '#f0e6ec',
      brightBlack: '#8b7080', brightRed: '#FF6659', brightGreen: '#66BB6A',
      brightYellow: '#FFB74D', brightBlue: '#42A5F5', brightMagenta: '#FF69B4',
      brightCyan: '#4DD0E1', brightWhite: '#ffffff'
    },
    allowTransparency: true,
    convertEol: true,
    scrollback: 5000
  })

  var fitAddon = new FitAddon()
  term.loadAddon(fitAddon)

  var info = { id: id, term: term, fitAddon: fitAddon, processId: null }
  this.terminals.push(info)
  this.activeTerminalId = id

  term.open(this.container)
  try { fitAddon.fit() } catch(e) {}

  term.onData(function(data) {
    if (info.processId) {
      window.anya.terminal.write(info.processId, data)
    }
  })

  term.onResize(function(size) {
    if (info.processId) {
      window.anya.terminal.resize(info.processId, size.cols, size.rows)
    }
  })

  term.write('Anya IDE Terminal\r\n')
  for (var i = 0; i < 30; i++) term.write('─')
  term.write('\r\n')

  this.startProcess(info)
  this.updateTabs()
}

TerminalPanel.prototype.startProcess = async function(info) {
  info.processId = await window.anya.terminal.create()

  var dataCleanup = window.anya.terminal.onData(function(data) {
    if (data.id === info.processId) {
      info.term.write(data.data)
    }
  })

  var exitCleanup = window.anya.terminal.onExit(function(data) {
    if (data.id === info.processId) {
      info.term.write('\r\n\x1b[31m[Process exited]\x1b[0m\r\n')
    }
  })

  info.term.focus()
}

TerminalPanel.prototype.updateTabs = function() {
  var self = this
  var tabBar = document.getElementById('terminal-tabs')
  var html = ''
  for (var i = 0; i < this.terminals.length; i++) {
    var t = this.terminals[i]
    html += '<span class="terminal-tab' + (t.id === this.activeTerminalId ? ' active' : '') + '" data-term-id="' + t.id + '">Terminal ' + (i + 1) + '</span>'
  }
  html += '<button id="terminal-new" title="New Terminal">+</button>'
  html += '<span id="terminal-close" title="Close">✕</span>'
  tabBar.innerHTML = html

  tabBar.querySelectorAll('.terminal-tab').forEach(function(el) {
    el.onclick = function() { self.switchTerminal(parseInt(el.dataset.termId)) }
  })

  document.getElementById('terminal-new').onclick = function() { self.createTerminal() }
  document.getElementById('terminal-close').onclick = function() { self.hide() }

  var panel = document.getElementById('terminal-panel')
  if (!panel.classList.contains('hidden')) {
    setTimeout(function() {
      self.terminals.forEach(function(t) { try { t.fitAddon.fit() } catch(e) {} })
    }, 50)
  }
}

TerminalPanel.prototype.switchTerminal = function(id) {
  this.activeTerminalId = id
  var info = this.terminals.find(function(t) { return t.id === id })
  if (info) {
    while (this.container.firstChild) this.container.removeChild(this.container.firstChild)
    info.term.open(this.container)
    try { info.fitAddon.fit() } catch(e) {}
    info.term.focus()
  }
  this.updateTabs()
}

TerminalPanel.prototype.toggle = function() {
  if (this.isVisible) { this.hide() } else { this.show() }
}

TerminalPanel.prototype.show = function() {
  document.getElementById('terminal-panel').classList.remove('hidden')
  this.isVisible = true
  var self = this
  setTimeout(function() {
    self.terminals.forEach(function(t) { try { t.fitAddon.fit() } catch(e) {} })
  }, 50)
  if (this.terminals.length === 0) this.createTerminal()
}

TerminalPanel.prototype.hide = function() {
  document.getElementById('terminal-panel').classList.add('hidden')
  this.isVisible = false
}

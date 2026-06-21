function CommandPalette(onCommand) {
  this.onCommand = onCommand
  this.overlay = document.getElementById('command-palette-overlay')
  this.input = document.getElementById('command-input')
  this.results = document.getElementById('command-results')
  this.isVisible = false
  this.selectedIdx = -1
  this.commands = []

  this.registerCommands()
  this.attachEvents()
}

CommandPalette.prototype.registerCommands = function() {
  this.commands = [
    { id: 'new-file', label: 'New File', icon: '📄', shortcut: 'Ctrl+N' },
    { id: 'open-file', label: 'Open File', icon: '📂', shortcut: 'Ctrl+O' },
    { id: 'open-folder', label: 'Open Folder', icon: '📁', shortcut: 'Ctrl+K' },
    { id: 'save-file', label: 'Save File', icon: '💾', shortcut: 'Ctrl+S' },
    { id: 'toggle-sidebar', label: 'Toggle Sidebar', icon: '📐', shortcut: 'Ctrl+B' },
    { id: 'toggle-terminal', label: 'Toggle Terminal', icon: '💻', shortcut: 'Ctrl+`' },
    { id: 'toggle-chat', label: 'Toggle AI Chat', icon: '🤖', shortcut: 'Ctrl+Shift+A' },
    { id: 'configure-provider', label: 'Configure AI Provider', icon: '🔑' },
    { id: 'explain-code', label: 'Explain Code with AI', icon: '🤔' },
    { id: 'fix-with-ai', label: 'Fix Code with AI', icon: '🔧' },
    { id: 'settings', label: 'Open Settings', icon: '⚙️' },
    { id: 'find', label: 'Find in File', icon: '🔍', shortcut: 'Ctrl+F' },
    { id: 'undo', label: 'Undo', icon: '↩️', shortcut: 'Ctrl+Z' },
    { id: 'redo', label: 'Redo', icon: '↪️', shortcut: 'Ctrl+Shift+Z' },
    { id: 'toggle-dev-tools', label: 'Toggle Developer Tools', icon: '🔧', shortcut: 'F12' },
    { id: 'shortcuts', label: 'Keyboard Shortcuts', icon: '⌨️', shortcut: 'Ctrl+Shift+K' },
    { id: 'about', label: 'About Anya IDE', icon: '♥' },
    { id: 'exit', label: 'Exit', icon: '🚪' }
  ]
}

CommandPalette.prototype.attachEvents = function() {
  var self = this

  this.input.addEventListener('input', function() { self.filter() })

  this.input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') { e.preventDefault(); self.executeSelected() }
    else if (e.key === 'ArrowDown') { e.preventDefault(); self.selectedIdx = Math.min(self.selectedIdx + 1, self.results.children.length - 1); self.highlight() }
    else if (e.key === 'ArrowUp') { e.preventDefault(); self.selectedIdx = Math.max(self.selectedIdx - 1, 0); self.highlight() }
    else if (e.key === 'Escape') { self.hide() }
  })

  this.overlay.addEventListener('click', function(e) {
    if (e.target === self.overlay) self.hide()
  })
}

CommandPalette.prototype.filter = function() {
  var self = this
  var query = this.input.value.toLowerCase()
  var filtered = query ? this.commands.filter(function(c) { return c.label.toLowerCase().includes(query) || c.id.includes(query) }) : this.commands

  this.selectedIdx = 0
  this.results.innerHTML = filtered.map(function(cmd, i) {
    var label = cmd.label
    if (query) {
      var re = new RegExp('(' + query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi')
      label = cmd.label.replace(re, '<strong style="color:var(--anya-primary)">$1</strong>')
    }
    return '<div class="command-item' + (i === 0 ? ' selected' : '') + '" data-cmd="' + cmd.id + '">' +
      '<span class="cmd-icon">' + cmd.icon + '</span>' +
      '<span class="cmd-label">' + label + '</span>' +
      (cmd.shortcut ? '<span class="cmd-shortcut">' + cmd.shortcut + '</span>' : '') +
    '</div>'
  }).join('')

  this.results.querySelectorAll('.command-item').forEach(function(el) {
    el.onclick = function() { self.execute(el.dataset.cmd) }
    el.onmouseenter = function() {
      self.selectedIdx = Array.from(self.results.children).indexOf(el)
      self.highlight()
    }
  })
}

CommandPalette.prototype.highlight = function() {
  var children = this.results.children
  for (var i = 0; i < children.length; i++) {
    children[i].classList.toggle('selected', i === this.selectedIdx)
  }
  if (children[this.selectedIdx]) {
    children[this.selectedIdx].scrollIntoView({ block: 'nearest' })
  }
}

CommandPalette.prototype.executeSelected = function() {
  var el = this.results.children[this.selectedIdx]
  if (el) this.execute(el.dataset.cmd)
}

CommandPalette.prototype.execute = function(cmdId) {
  this.hide()
  this.onCommand(cmdId)
}

CommandPalette.prototype.toggle = function() {
  if (this.isVisible) this.hide()
  else this.show()
}

CommandPalette.prototype.show = function() {
  this.overlay.classList.remove('hidden')
  this.isVisible = true
  this.input.value = ''
  this.selectedIdx = 0
  this.filter()
  var self = this
  setTimeout(function() { self.input.focus() }, 50)
}

CommandPalette.prototype.hide = function() {
  this.overlay.classList.add('hidden')
  this.isVisible = false
}

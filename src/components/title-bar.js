function TitleBar() {
  var self = this
  this.container = document.getElementById('titlebar')
  this.isMaximized = false

  window.anya.isMaximized().then(function(v) { self.isMaximized = v })

  this.render()
  this.attachEvents()
}

TitleBar.prototype.render = function() {
  this.container.innerHTML =
    '<div class="titlebar-left">' +
      '<span class="titlebar-logo">♥</span>' +
      '<span class="titlebar-title">Anya IDE</span>' +
    '</div>' +
    '<div class="titlebar-menu">' +
      '<button class="titlebar-menu-btn" data-menu="file">File</button>' +
      '<button class="titlebar-menu-btn" data-menu="edit">Edit</button>' +
      '<button class="titlebar-menu-btn" data-menu="view">View</button>' +
      '<button class="titlebar-menu-btn" data-menu="ai">AI</button>' +
      '<button class="titlebar-menu-btn" data-menu="help">Help</button>' +
    '</div>' +
    '<div class="titlebar-right">' +
      '<button class="titlebar-settings-btn" title="Settings" id="titlebar-settings">' +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
          '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>' +
        '</svg>' +
      '</button>' +
    '</div>' +
    '<div class="titlebar-controls">' +
      '<button class="btn-minimize" title="Minimize">─</button>' +
      '<button class="btn-maximize" title="Maximize">□</button>' +
      '<button class="btn-close" title="Close">✕</button>' +
    '</div>'
}

TitleBar.prototype.attachEvents = function() {
  var self = this
  this.container.querySelector('.btn-minimize').onclick = function() { window.anya.window.minimize() }
  this.container.querySelector('.btn-maximize').onclick = function() {
    self.isMaximized = !self.isMaximized
    self.container.querySelector('.btn-maximize').textContent = self.isMaximized ? '❐' : '□'
    window.anya.window.maximize()
  }
  this.container.querySelector('.btn-close').onclick = function() { window.anya.window.close() }

  var menus = {
    file: [
      { label: 'New File', shortcut: 'Ctrl+N', action: 'new-file' },
      { label: 'Open File...', shortcut: 'Ctrl+O', action: 'open-file' },
      { label: 'Open Folder...', shortcut: 'Ctrl+K', action: 'open-folder' },
      { type: 'separator' },
      { label: 'Save', shortcut: 'Ctrl+S', action: 'save-file' },
      { label: 'Save As...', shortcut: 'Ctrl+Shift+S', action: 'save-as' },
      { type: 'separator' },
      { label: 'Open Settings', action: 'settings' },
      { type: 'separator' },
      { label: 'Exit', action: 'exit' }
    ],
    edit: [
      { label: 'Undo', shortcut: 'Ctrl+Z', action: 'undo' },
      { label: 'Redo', shortcut: 'Ctrl+Shift+Z', action: 'redo' },
      { type: 'separator' },
      { label: 'Cut', shortcut: 'Ctrl+X', action: 'cut' },
      { label: 'Copy', shortcut: 'Ctrl+C', action: 'copy' },
      { label: 'Paste', shortcut: 'Ctrl+V', action: 'paste' },
      { type: 'separator' },
      { label: 'Find', shortcut: 'Ctrl+F', action: 'find' }
    ],
    view: [
      { label: 'Command Palette...', shortcut: 'Ctrl+Shift+P', action: 'command-palette' },
      { type: 'separator' },
      { label: 'Toggle Sidebar', shortcut: 'Ctrl+B', action: 'toggle-sidebar' },
      { label: 'Toggle Terminal', shortcut: 'Ctrl+`', action: 'toggle-terminal' },
      { label: 'Toggle AI Chat', shortcut: 'Ctrl+Shift+A', action: 'toggle-chat' },
      { type: 'separator' },
      { label: 'Toggle Developer Tools', shortcut: 'F12', action: 'devtools' }
    ],
    ai: [
      { label: 'Toggle AI Chat', shortcut: 'Ctrl+Shift+A', action: 'toggle-chat' },
      { label: 'Configure Provider...', action: 'settings' },
      { type: 'separator' },
      { label: 'Explain Code', action: 'explain-code' },
      { label: 'Fix with AI', action: 'fix-with-ai' }
    ],
    help: [
      { label: 'About Anya IDE', action: 'about' },
      { type: 'separator' },
      { label: 'Keyboard Shortcuts', shortcut: 'Ctrl+Shift+K', action: 'shortcuts' }
    ]
  }

  var settingsBtn = document.getElementById('titlebar-settings')
  if (settingsBtn) {
    settingsBtn.onclick = function() {
      document.dispatchEvent(new CustomEvent('menu-trigger', { detail: 'settings' }))
    }
  }

  this.container.querySelectorAll('.titlebar-menu-btn').forEach(function(btn) {
    btn.onclick = function(e) {
      e.stopPropagation()
      var items = menus[btn.dataset.menu]
      if (items) self.showDropdown(btn, items)
    }
  })
}

TitleBar.prototype.showDropdown = function(anchor, items) {
  var existing = document.querySelector('.titlebar-dropdown')
  if (existing) existing.remove()

  var dropdown = document.createElement('div')
  dropdown.className = 'titlebar-dropdown'
  dropdown.style.cssText = 'position:fixed;top:36px;left:' + anchor.offsetLeft + 'px;min-width:220px'

  for (var i = 0; i < items.length; i++) {
    var item = items[i]
    if (item.type === 'separator') {
      var sep = document.createElement('div')
      sep.style.cssText = 'height:1px;background:var(--anya-border);margin:4px 0'
      dropdown.appendChild(sep)
    } else {
      var el = document.createElement('div')
      el.style.cssText = 'padding:5px 16px;cursor:pointer;font-size:12px;display:flex;align-items:center;justify-content:space-between;color:var(--anya-text);background:white'
      el.innerHTML = '<span>' + item.label + '</span>' + (item.shortcut ? '<span style="color:var(--anya-text-muted);font-size:11px;font-family:var(--font-mono)">' + item.shortcut + '</span>' : '')
      el.onmouseenter = function() { this.style.background = 'var(--anya-surface)' }
      el.onmouseleave = function() { this.style.background = 'none' }
      el.onclick = function(action) {
        return function() {
          dropdown.remove()
          document.dispatchEvent(new CustomEvent('menu-trigger', { detail: action }))
        }
      }(item.action)
      dropdown.appendChild(el)
    }
  }

  document.body.appendChild(dropdown)
  setTimeout(function() {
    document.addEventListener('click', function closeMenu(e) {
      if (!dropdown.contains(e.target) && !anchor.contains(e.target)) {
        dropdown.remove()
        document.removeEventListener('click', closeMenu)
      }
    })
  }, 0)
}

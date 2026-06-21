function StatusBar() {
  this.container = document.getElementById('statusbar')
  this.editorInfo = { line: 1, col: 1, language: 'plaintext', encoding: 'UTF-8' }
  this.aiInfo = null
  this.render()
}

StatusBar.prototype.updateEditor = function(info) {
  for (var key in info) {
    if (info.hasOwnProperty(key)) this.editorInfo[key] = info[key]
  }
  this.render()
}

StatusBar.prototype.updateAI = function(info) {
  this.aiInfo = info
  this.render()
}

StatusBar.prototype.render = function() {
  var info = this.editorInfo
  var aiHtml = ''
  if (this.aiInfo) {
    aiHtml = '<span class="status-item"><span>AI: ' + AnyaHelpers.escapeHtml(this.aiInfo.name) + '</span></span>'
  }

  this.container.innerHTML =
    '<div class="status-left">' +
      '<span class="status-item"><span class="status-icon status-primary">♥</span><span>Anya</span></span>' +
      '<span class="status-item"><span>' + AnyaHelpers.escapeHtml(info.language) + '</span></span>' +
      aiHtml +
    '</div>' +
    '<div class="status-right">' +
      '<span class="status-item"><span>Ln ' + info.line + ', Col ' + info.col + '</span></span>' +
      '<span class="status-item"><span>' + AnyaHelpers.escapeHtml(info.encoding) + '</span></span>' +
      '<span class="status-item"><span>Spaces: 2</span></span>' +
    '</div>'
}

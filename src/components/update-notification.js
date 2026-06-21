function UpdateNotification() {
  this.isVisible = false
  this.latestVersion = ''
  this.currentVersion = ''
  this.releaseNotes = ''
  this.downloadProgress = -1
  this.downloadComplete = false
  this.remindCallback = null
  this.skipCallback = null
  this.downloadCallback = null
  this.installCallback = null

  this.render()
  this.listen()
}

UpdateNotification.prototype.render = function() {
  var container = document.getElementById('update-notification')
  if (!container) {
    container = document.createElement('div')
    container.id = 'update-notification'
    container.className = 'hidden'
    document.body.appendChild(container)
  }
  this.container = container
}

UpdateNotification.prototype.listen = function() {
  var self = this
  window.anya.update.onNotification(function(event, data) {
    self.handleEvent(event, data)
  })
}

UpdateNotification.prototype.handleEvent = function(event, data) {
  switch (event) {
    case 'update-available':
      this.showUpdateAvailable(data)
      break
    case 'update-download-progress':
      this.updateProgress(data)
      break
    case 'update-download-complete':
      this.showDownloadComplete(data)
      break
    case 'update-error':
      this.showError(data)
      break
  }
}

UpdateNotification.prototype.showUpdateAvailable = function(data) {
  this.latestVersion = data.latestVersion || ''
  this.currentVersion = data.currentVersion || ''
  this.releaseNotes = data.releaseNotes || ''

  this.downloadProgress = -1
  this.downloadComplete = false

  var notesHtml = ''
  if (this.releaseNotes) {
    notesHtml = '<div class="update-notes">' + this.formatReleaseNotes(this.releaseNotes) + '</div>'
  }

  this.container.innerHTML =
    '<div class="update-popup">' +
      '<div class="update-header">' +
        '<span class="update-icon">♥</span>' +
        '<span class="update-title">Update Available</span>' +
        '<button class="update-close" id="update-dismiss">✕</button>' +
      '</div>' +
      '<div class="update-body">' +
        '<div class="update-version-info">' +
          '<span class="update-version-new">v' + AnyaHelpers.escapeHtml(this.latestVersion) + '</span>' +
          '<span class="update-version-sep">→</span>' +
          '<span class="update-version-old">v' + AnyaHelpers.escapeHtml(this.currentVersion) + '</span>' +
        '</div>' +
        notesHtml +
        '<div id="update-progress-area" class="update-progress-area hidden">' +
          '<div class="update-progress-bar">' +
            '<div class="update-progress-fill" id="update-progress-fill" style="width:0%"></div>' +
          '</div>' +
          '<span class="update-progress-text" id="update-progress-text">Downloading...</span>' +
        '</div>' +
        '<div id="update-restart-area" class="update-restart-area hidden">' +
          '<span class="update-restart-icon">✓</span>' +
          '<span>Download complete! Install now?</span>' +
        '</div>' +
      '</div>' +
      '<div class="update-footer" id="update-footer">' +
        '<button class="update-btn update-btn-secondary" id="update-remind">Remind Tomorrow</button>' +
        '<button class="update-btn update-btn-secondary" id="update-skip">Skip v' + AnyaHelpers.escapeHtml(this.latestVersion) + '</button>' +
        '<button class="update-btn update-btn-primary" id="update-download">Download Update</button>' +
      '</div>' +
    '</div>'

  this.show()
  this.attachEvents()

  AnyaToast.info('Update available: v' + this.latestVersion)
}

UpdateNotification.prototype.attachEvents = function() {
  var self = this

  var dismissBtn = document.getElementById('update-dismiss')
  if (dismissBtn) dismissBtn.onclick = function() { self.hide() }

  var remindBtn = document.getElementById('update-remind')
  if (remindBtn) remindBtn.onclick = function() {
    window.anya.update.remindLater()
    self.hide()
    AnyaToast.info('Update reminder set for tomorrow')
  }

  var skipBtn = document.getElementById('update-skip')
  if (skipBtn) skipBtn.onclick = function() {
    window.anya.update.skipVersion(self.latestVersion)
    self.hide()
    AnyaToast.info('Skipped v' + self.latestVersion)
  }

  var downloadBtn = document.getElementById('update-download')
  if (downloadBtn) downloadBtn.onclick = function() {
    self.startDownload()
  }
}

UpdateNotification.prototype.startDownload = function() {
  var footer = document.getElementById('update-footer')
  var progressArea = document.getElementById('update-progress-area')

  if (footer) footer.classList.add('hidden')
  if (progressArea) progressArea.classList.remove('hidden')

  this.downloadProgress = 0
  this.updateProgressBar()

  window.anya.update.download()
}

UpdateNotification.prototype.updateProgress = function(data) {
  this.downloadProgress = data.percent || 0
  this.updateProgressBar()
}

UpdateNotification.prototype.updateProgressBar = function() {
  var fill = document.getElementById('update-progress-fill')
  var text = document.getElementById('update-progress-text')
  if (fill) fill.style.width = Math.min(this.downloadProgress, 100) + '%'
  if (text) text.textContent = 'Downloading... ' + this.downloadProgress + '%'
}

UpdateNotification.prototype.showDownloadComplete = function(data) {
  this.downloadComplete = true

  var progressArea = document.getElementById('update-progress-area')
  var restartArea = document.getElementById('update-restart-area')
  var footer = document.getElementById('update-footer')

  if (progressArea) progressArea.classList.add('hidden')
  if (restartArea) restartArea.classList.remove('hidden')

  if (footer) {
    footer.classList.remove('hidden')
    footer.innerHTML = '<button class="update-btn update-btn-primary" id="update-install">Restart to Update</button>'
    document.getElementById('update-install').onclick = function() {
      window.anya.update.install()
    }
  }
}

UpdateNotification.prototype.showError = function(data) {
  var self = this
  this.downloadProgress = -1

  var progressArea = document.getElementById('update-progress-area')
  var footer = document.getElementById('update-footer')

  if (progressArea) {
    progressArea.innerHTML = '<span style="color:var(--anya-error);font-size:12px">✕ ' +
      AnyaHelpers.escapeHtml(data.error || 'Update failed') + '</span>'
  }

  if (footer) {
    footer.classList.remove('hidden')
    footer.innerHTML = '<button class="update-btn update-btn-secondary" id="update-retry">Retry</button>' +
      '<button class="update-btn update-btn-secondary" id="update-dismiss-error">Dismiss</button>'

    document.getElementById('update-retry').onclick = function() { self.startDownload() }
    document.getElementById('update-dismiss-error').onclick = function() { self.hide() }
  }
}

UpdateNotification.prototype.formatReleaseNotes = function(notes) {
  if (!notes) return ''
  var text = notes
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/###\s+(.*)/g, '<strong>$1</strong>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/[*] (.+)/g, '• $1')
    .replace(/\n/g, '<br>')
  return text.substring(0, 500) + (text.length > 500 ? '...' : '')
}

UpdateNotification.prototype.show = function() {
  this.container.classList.remove('hidden')
  this.isVisible = true
}

UpdateNotification.prototype.hide = function() {
  this.container.classList.add('hidden')
  this.isVisible = false
}

UpdateNotification.prototype.toggle = function() {
  if (this.isVisible) this.hide()
  else this.show()
}

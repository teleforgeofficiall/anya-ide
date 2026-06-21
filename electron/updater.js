const https = require('https')
const http = require('http')
const path = require('path')
const fs = require('fs')
const { spawn } = require('child_process')
const { app } = require('electron')

var UPDATE_CONFIG = {
  githubOwner: 'teleforgeofficiall',
  githubRepo: 'anya-ide',
  currentVersion: '1.0.0'
}

function UpdateManager(mainWindow) {
  this.mainWindow = mainWindow
  this.downloadPath = null
  this.checkInterval = null
  this.isDownloading = false
  this.downloadAborted = false
  this.downloadPaused = false
  this.latestInfo = null
  this.downloadReq = null
  this.downloadFile = null
  this.receivedBytes = 0
  this.totalBytes = 0
  this.packagePath = path.join(__dirname, '..', 'package.json')

  var self = this
  try {
    var pkg = JSON.parse(fs.readFileSync(self.packagePath, 'utf-8'))
    if (pkg.version) UPDATE_CONFIG.currentVersion = pkg.version
  } catch(e) {}
}

UpdateManager.prototype.setConfig = function(config) {
  if (config.githubOwner) UPDATE_CONFIG.githubOwner = config.githubOwner
  if (config.githubRepo) UPDATE_CONFIG.githubRepo = config.githubRepo
}

UpdateManager.prototype.getConfig = function() {
  var configPath = path.join(app.getPath('userData'), 'anya-ide-config.json')
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'))
  } catch(e) {
    return {}
  }
}

UpdateManager.prototype.checkForUpdates = function() {
  var self = this
  return new Promise(function(resolve) {
    var url = 'https://api.github.com/repos/' + UPDATE_CONFIG.githubOwner + '/' + UPDATE_CONFIG.githubRepo + '/releases/latest'

    var opts = {
      hostname: 'api.github.com',
      path: '/repos/' + UPDATE_CONFIG.githubOwner + '/' + UPDATE_CONFIG.githubRepo + '/releases/latest',
      method: 'GET',
      headers: {
        'User-Agent': 'anya-ide-updater',
        'Accept': 'application/vnd.github.v3+json'
      },
      timeout: 10000
    }

    var req = https.request(opts, function(res) {
      var body = ''
      res.on('data', function(c) { body += c.toString() })
      res.on('end', function() {
        try {
          if (res.statusCode !== 200) {
            resolve({ success: false, error: 'GitHub API returned ' + res.statusCode })
            return
          }
          var data = JSON.parse(body)
          var latestVersion = data.tag_name ? data.tag_name.replace(/^v/i, '') : ''
          var downloadUrl = null
          var assetName = null

          if (data.assets && data.assets.length > 0) {
            for (var i = 0; i < data.assets.length; i++) {
              var asset = data.assets[i]
              if (asset.name && asset.name.indexOf('Setup') !== -1 && asset.name.indexOf('.exe') !== -1) {
                downloadUrl = asset.browser_download_url
                assetName = asset.name
                break
              }
            }
            if (!downloadUrl) {
              var firstExe = data.assets.find(function(a) { return a.name && a.name.indexOf('.exe') !== -1 })
              if (firstExe) {
                downloadUrl = firstExe.browser_download_url
                assetName = firstExe.name
              }
            }
          }

          var result = {
            success: true,
            latestVersion: latestVersion,
            currentVersion: UPDATE_CONFIG.currentVersion,
            hasUpdate: self.compareVersions(latestVersion, UPDATE_CONFIG.currentVersion) > 0,
            downloadUrl: downloadUrl,
            assetName: assetName,
            releaseName: data.name || '',
            releaseNotes: data.body || '',
            htmlUrl: data.html_url || '',
            publishedAt: data.published_at || ''
          }

          self.latestInfo = result
          resolve(result)
        } catch (e) {
          resolve({ success: false, error: 'Parse error: ' + e.message })
        }
      })
    })

    req.on('error', function(e) {
      resolve({ success: false, error: 'Network error: ' + e.message })
    })

    req.on('timeout', function() { req.destroy(); resolve({ success: false, error: 'Timeout' }) })

    req.end()
  })
}

UpdateManager.prototype.compareVersions = function(v1, v2) {
  if (!v1 || !v2) return 0
  var a = v1.replace(/^v/i, '').split('.').map(Number)
  var b = v2.replace(/^v/i, '').split('.').map(Number)
  for (var i = 0; i < Math.max(a.length, b.length); i++) {
    var na = a[i] || 0
    var nb = b[i] || 0
    if (na > nb) return 1
    if (na < nb) return -1
  }
  return 0
}

UpdateManager.prototype.downloadUpdate = function() {
  var self = this
  if (!this.latestInfo || !this.latestInfo.downloadUrl) {
    this.sendToRenderer('update-error', { error: 'No download URL available' })
    return
  }

  if (this.isDownloading) return
  this.isDownloading = true
  this.downloadAborted = false
  this.downloadPaused = false
  this.receivedBytes = 0
  this.totalBytes = 0

  var url = this.latestInfo.downloadUrl
  var fileName = this.latestInfo.assetName || 'Anya-IDE-Setup-' + this.latestInfo.latestVersion + '.exe'
  this.downloadPath = path.join(require('os').tmpdir(), fileName)

  this.startDownloadRequest(url)
}

UpdateManager.prototype.startDownloadRequest = function(url, rangeStart) {
  var self = this
  var parsedUrl = new URL(url)
  var mod = parsedUrl.protocol === 'https:' ? https : http
  rangeStart = rangeStart || 0

  var opts = {
    hostname: parsedUrl.hostname,
    path: parsedUrl.pathname + parsedUrl.search,
    method: 'GET',
    headers: { 'User-Agent': 'anya-ide-updater' },
    timeout: 300000
  }

  if (rangeStart > 0) {
    opts.headers['Range'] = 'bytes=' + rangeStart + '-'
  }

  var fileOpts = rangeStart > 0 ? { flags: 'a' } : {}
  self.downloadFile = fs.createWriteStream(self.downloadPath, fileOpts)

  self.downloadReq = mod.request(opts, function(res) {
    self.totalBytes = parseInt(res.headers['content-length']) || 0
    if (rangeStart > 0 && self.totalBytes > 0) {
      self.totalBytes += rangeStart
    }

    res.on('data', function(chunk) {
      if (self.downloadAborted) {
        res.destroy()
        self.cleanupDownload()
        return
      }
      if (self.downloadPaused) {
        res.destroy()
        self.downloadFile.end()
        self.downloadReq = null
        self.isDownloading = false
        self.sendToRenderer('update-download-paused', {
          percent: self.totalBytes > 0 ? Math.round((self.receivedBytes / self.totalBytes) * 100) : 0,
          received: self.receivedBytes,
          total: self.totalBytes
        })
        return
      }
      self.receivedBytes += chunk.length
      self.downloadFile.write(chunk)
      if (self.totalBytes > 0) {
        var pct = Math.round((self.receivedBytes / self.totalBytes) * 100)
        self.sendToRenderer('update-download-progress', { percent: pct, received: self.receivedBytes, total: self.totalBytes })
      }
    })

    res.on('end', function() {
      self.downloadFile.end()
      self.isDownloading = false
      self.downloadReq = null
      self.sendToRenderer('update-download-complete', {
        path: self.downloadPath,
        version: self.latestInfo.latestVersion
      })
    })
  })

  self.downloadReq.on('error', function(e) {
    if (self.downloadPaused) return
    self.cleanupDownload()
    self.sendToRenderer('update-error', { error: 'Download failed: ' + e.message })
  })

  self.downloadReq.on('timeout', function() {
    self.downloadReq.destroy()
    self.cleanupDownload()
    self.sendToRenderer('update-error', { error: 'Download timed out' })
  })

  self.downloadReq.end()
}

UpdateManager.prototype.pauseDownload = function() {
  if (!this.isDownloading || this.downloadPaused) return
  this.downloadPaused = true
  if (this.downloadReq) {
    this.downloadReq.destroy()
    this.downloadReq = null
  }
}

UpdateManager.prototype.resumeDownload = function() {
  if (!this.downloadPath || !this.latestInfo) return
  if (this.isDownloading) return
  if (!this.downloadPaused && this.receivedBytes === 0) return

  this.downloadPaused = false
  this.downloadAborted = false
  this.isDownloading = true

  this.startDownloadRequest(this.latestInfo.downloadUrl, this.receivedBytes)
}

UpdateManager.prototype.cancelDownload = function() {
  this.downloadAborted = true
  this.downloadPaused = false
  this.isDownloading = false
  if (this.downloadReq) {
    this.downloadReq.destroy()
    this.downloadReq = null
  }
  this.cleanupDownload()
  this.receivedBytes = 0
  this.totalBytes = 0
  this.sendToRenderer('update-download-cancelled', {})
}

UpdateManager.prototype.cleanupDownload = function() {
  if (this.downloadFile) {
    try { this.downloadFile.close() } catch(e) {}
    this.downloadFile = null
  }
  if (this.downloadPath) {
    try { fs.unlinkSync(this.downloadPath) } catch(e) {}
    this.downloadPath = null
  }
}

UpdateManager.prototype.installUpdate = function() {
  if (!this.downloadPath || !fs.existsSync(this.downloadPath)) {
    this.sendToRenderer('update-error', { error: 'Downloaded file not found' })
    return
  }

  try {
    var installerPath = this.downloadPath
    setTimeout(function() {
      spawn(installerPath, ['/S', '/silent'], {
        detached: true,
        stdio: 'ignore'
      }).unref()
    }, 500)

    app.quit()
  } catch (e) {
    this.sendToRenderer('update-error', { error: 'Install error: ' + e.message })
  }
}

UpdateManager.prototype.startPeriodicCheck = function(intervalMs) {
  var self = this
  intervalMs = intervalMs || 1800000
  this.stopPeriodicCheck()
  this.checkInterval = setInterval(function() {
    self.checkForUpdates().then(function(result) {
      self.handleCheckResult(result)
    })
  }, intervalMs)
}

UpdateManager.prototype.stopPeriodicCheck = function() {
  if (this.checkInterval) {
    clearInterval(this.checkInterval)
    this.checkInterval = null
  }
}

UpdateManager.prototype.handleCheckResult = function(result) {
  if (result.success && result.hasUpdate) {
    var config = this.getConfig()
    var updatePrefs = config.update || {}
    if (updatePrefs.skipVersion === result.latestVersion) return
    if (updatePrefs.remindLaterUntil && Date.now() < updatePrefs.remindLaterUntil) return

    this.sendToRenderer('update-available', {
      latestVersion: result.latestVersion,
      currentVersion: result.currentVersion,
      releaseNotes: result.releaseNotes,
      releaseName: result.releaseName,
      downloadUrl: result.downloadUrl,
      htmlUrl: result.htmlUrl
    })
  }
}

UpdateManager.prototype.sendToRenderer = function(event, data) {
  if (this.mainWindow && !this.mainWindow.isDestroyed()) {
    this.mainWindow.webContents.send('update-event', { event: event, data: data })
  }
}

module.exports = UpdateManager

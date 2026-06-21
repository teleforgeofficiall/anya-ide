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
  this.latestInfo = null
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

  var url = this.latestInfo.downloadUrl
  var fileName = this.latestInfo.assetName || 'Anya-IDE-Setup-' + this.latestInfo.latestVersion + '.exe'
  this.downloadPath = path.join(require('os').tmpdir(), fileName)

  var parsedUrl = new URL(url)
  var mod = parsedUrl.protocol === 'https:' ? https : http

  var opts = {
    hostname: parsedUrl.hostname,
    path: parsedUrl.pathname + parsedUrl.search,
    method: 'GET',
    headers: { 'User-Agent': 'anya-ide-updater' },
    timeout: 300000
  }

  var file = fs.createWriteStream(self.downloadPath)
  var receivedBytes = 0
  var totalBytes = 0

  var req = mod.request(opts, function(res) {
    totalBytes = parseInt(res.headers['content-length']) || 0

    res.on('data', function(chunk) {
      if (self.downloadAborted) {
        res.destroy()
        file.close()
        try { fs.unlinkSync(self.downloadPath) } catch(e) {}
        return
      }
      receivedBytes += chunk.length
      file.write(chunk)
      if (totalBytes > 0) {
        var pct = Math.round((receivedBytes / totalBytes) * 100)
        self.sendToRenderer('update-download-progress', { percent: pct, received: receivedBytes, total: totalBytes })
      }
    })

    res.on('end', function() {
      file.end()
      self.isDownloading = false
      self.sendToRenderer('update-download-complete', {
        path: self.downloadPath,
        version: self.latestInfo.latestVersion
      })
    })
  })

  req.on('error', function(e) {
    file.close()
    self.isDownloading = false
    try { fs.unlinkSync(self.downloadPath) } catch(e) {}
    self.sendToRenderer('update-error', { error: 'Download failed: ' + e.message })
  })

  req.on('timeout', function() {
    req.destroy()
    file.close()
    self.isDownloading = false
    try { fs.unlinkSync(self.downloadPath) } catch(e) {}
    self.sendToRenderer('update-error', { error: 'Download timed out' })
  })

  req.end()
}

UpdateManager.prototype.abortDownload = function() {
  this.downloadAborted = true
  this.isDownloading = false
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

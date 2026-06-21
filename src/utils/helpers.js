var AnyaHelpers = {}

AnyaHelpers.debounce = function(fn, delay) {
  var timer
  return function() {
    var args = arguments
    var ctx = this
    clearTimeout(timer)
    timer = setTimeout(function() { fn.apply(ctx, args) }, delay)
  }
}

AnyaHelpers.escapeHtml = function(str) {
  var div = document.createElement('div')
  div.textContent = str
  return div.innerHTML
}

AnyaHelpers.getLanguageFromPath = function(filePath) {
  var parts = filePath.split('.')
  var ext = parts[parts.length - 1].toLowerCase()
  var map = {
    js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
    ts: 'typescript', tsx: 'typescript',
    html: 'html', htm: 'html',
    css: 'css', scss: 'scss', sass: 'scss', less: 'less',
    json: 'json', jsonc: 'json',
    md: 'markdown', markdown: 'markdown',
    py: 'python', rb: 'ruby', rs: 'rust', go: 'go',
    java: 'java', cpp: 'cpp', c: 'c', h: 'c', hpp: 'cpp',
    xml: 'xml', svg: 'xml', yaml: 'yaml', yml: 'yaml',
    toml: 'toml', ini: 'ini', cfg: 'ini',
    sh: 'shell', bash: 'shell', zsh: 'shell',
    bat: 'bat', ps1: 'powershell',
    sql: 'sql', csv: 'plaintext', txt: 'plaintext',
    env: 'plaintext', gitignore: 'plaintext',
    dockerfile: 'dockerfile', dockerignore: 'dockerfile'
  }
  return map[ext] || 'plaintext'
}

AnyaHelpers.getFileIcon = function(filePath, isDir) {
  if (isDir) return '📁'
  var parts = filePath.replace(/\\/g, '/').split('/')
  var name = parts[parts.length - 1]
  var ext = name.split('.').pop().toLowerCase()
  var iconMap = {
    js: '📜', jsx: '⚛️', ts: '📘', tsx: '⚛️',
    html: '🌐', css: '🎨', scss: '🎨', json: '📋',
    md: '📝', py: '🐍', rs: '🦀', go: '🔷',
    java: '☕', cpp: '⚙️', c: '⚙️', rb: '💎',
    yml: '📄', yaml: '📄', toml: '📄',
    svg: '🖼️', png: '🖼️', jpg: '🖼️', jpeg: '🖼️', gif: '🖼️', ico: '🖼️',
    sh: '💻', bat: '💻', ps1: '💻', bash: '💻',
    sql: '🗄️', csv: '📊', txt: '📄',
    xml: '📰', lock: '🔒', env: '🔑',
    exe: '⚡', dll: '🔧', zip: '📦', tar: '📦', gz: '📦',
    pdf: '📕', woff: '🔤', woff2: '🔤', ttf: '🔤',
    gitignore: '🙈', dockerfile: '🐳',
    psd: '🎨', ai: '🎨', sketch: '🎨',
    mp3: '🎵', wav: '🎵', flac: '🎵', ogg: '🎵',
    mp4: '🎬', avi: '🎬', mov: '🎬', mkv: '🎬'
  }
  return iconMap[ext] || '📄'
}

AnyaHelpers.getBasename = function(filePath) {
  var parts = filePath.replace(/\\/g, '/').split('/')
  return parts[parts.length - 1]
}

AnyaHelpers.formatFileSize = function(bytes) {
  if (bytes === 0) return '0 B'
  var k = 1024
  var sizes = ['B', 'KB', 'MB', 'GB']
  var i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function FileSystemService() {
  this.currentFolder = null
}

FileSystemService.prototype.openFolder = async function() {
  var path = await window.anya.dialog.openFolder()
  if (path) { this.currentFolder = path; return path }
  return null
}

FileSystemService.prototype.openFile = async function() {
  return await window.anya.dialog.openFile()
}

FileSystemService.prototype.saveFile = async function(filePath, content) {
  return await window.anya.dialog.saveFile({ filePath: filePath, content: content })
}

FileSystemService.prototype.readDirectory = async function(dirPath) {
  return await window.anya.fileSystem.readDirectory(dirPath)
}

FileSystemService.prototype.readFile = async function(filePath) {
  return await window.anya.fileSystem.readFile(filePath)
}

FileSystemService.prototype.writeFile = async function(filePath, content) {
  return await window.anya.fileSystem.writeFile(filePath, content)
}

FileSystemService.prototype.createFile = async function(filePath) {
  return await window.anya.fileSystem.createFile(filePath)
}

FileSystemService.prototype.createDirectory = async function(dirPath) {
  return await window.anya.fileSystem.createDirectory(dirPath)
}

FileSystemService.prototype.deleteEntry = async function(entryPath) {
  return await window.anya.fileSystem.deleteEntry(entryPath)
}

FileSystemService.prototype.renameEntry = async function(oldPath, newPath) {
  return await window.anya.fileSystem.renameEntry(oldPath, newPath)
}

FileSystemService.prototype.fileExists = async function(filePath) {
  return await window.anya.fileSystem.fileExists(filePath)
}

FileSystemService.prototype.getFileTree = async function(dirPath) {
  var result = await this.readDirectory(dirPath)
  if (!result.success) return null

  var items = []
  for (var i = 0; i < result.items.length; i++) {
    var item = result.items[i]
    if (item.isDirectory) {
      var children = await this.getFileTree(item.path)
      items.push({ name: item.name, path: item.path, isDirectory: true, isFile: false, children: children || [] })
    } else {
      items.push(item)
    }
  }
  return items
}

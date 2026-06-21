const fs = require('fs')
const path = require('path')

const pngPath = path.join(__dirname, '..', 'assets', 'icon.png')
const icoPath = path.join(__dirname, '..', 'assets', 'icon.ico')

const pngData = fs.readFileSync(pngPath)

const header = Buffer.alloc(6)
header.writeUInt16LE(0, 0)    // Reserved
header.writeUInt16LE(1, 2)    // Type: 1 = icon
header.writeUInt16LE(1, 4)    // Count: 1 image

const offset = 6 + 16         // header + 1 directory entry
const entry = Buffer.alloc(16)
entry.writeUInt8(0, 0)        // Width: 0 = 256
entry.writeUInt8(0, 1)        // Height: 0 = 256
entry.writeUInt8(0, 2)        // ColorCount: 0
entry.writeUInt8(0, 3)        // Reserved
entry.writeUInt16LE(1, 4)     // Planes
entry.writeUInt16LE(32, 6)    // BitCount: 32bpp
entry.writeUInt32LE(pngData.length, 8)  // Size
entry.writeUInt32LE(offset, 12)         // Offset

const ico = Buffer.concat([header, entry, pngData])
fs.writeFileSync(icoPath, ico)
console.log('icon.ico created (' + ico.length + ' bytes)')

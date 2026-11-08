export interface StoreZipEntry {
  name: string
  data: Uint8Array
}

function crc32(bytes: Uint8Array): number {
  let value = ~0
  for (const byte of bytes) {
    value ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value >>> 1) ^ (0xedb88320 & -(value & 1))
    }
  }
  return ~value >>> 0
}

function normalizedEntryName(name: string): string {
  const normalized = name.replaceAll("\\", "/").trim()
  if (
    !normalized
    || normalized.startsWith("/")
    || normalized.includes("\u0000")
    || normalized.split("/").some((part) => !part || part === "." || part === "..")
  ) {
    throw new Error(`ZIP 路径非法：${name}`)
  }
  return normalized
}

/**
 * 服务端 ZIP 只使用 store 模式：成片包本身已经是 MP4/JPEG 等压缩格式，
 * 再做 deflate 收益很低，反而增加内存和实现风险。
 */
export function buildStoreZipBytes(entries: StoreZipEntry[]): Uint8Array {
  const encoder = new TextEncoder()
  const localParts: Uint8Array[] = []
  const centralParts: Uint8Array[] = []
  const now = new Date()
  const dosTime = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xffff
  const dosDate = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xffff
  let offset = 0

  for (const entry of entries) {
    const name = normalizedEntryName(entry.name)
    const nameBytes = encoder.encode(name)
    const size = entry.data.length
    const crc = crc32(entry.data)
    const local = new Uint8Array(30 + nameBytes.length)
    const localView = new DataView(local.buffer)
    localView.setUint32(0, 0x04034b50, true)
    localView.setUint16(4, 20, true)
    localView.setUint16(6, 0x0800, true)
    localView.setUint16(8, 0, true)
    localView.setUint16(10, dosTime, true)
    localView.setUint16(12, dosDate, true)
    localView.setUint32(14, crc, true)
    localView.setUint32(18, size, true)
    localView.setUint32(22, size, true)
    localView.setUint16(26, nameBytes.length, true)
    local.set(nameBytes, 30)
    localParts.push(local, entry.data)

    const central = new Uint8Array(46 + nameBytes.length)
    const centralView = new DataView(central.buffer)
    centralView.setUint32(0, 0x02014b50, true)
    centralView.setUint16(4, 20, true)
    centralView.setUint16(6, 20, true)
    centralView.setUint16(8, 0x0800, true)
    centralView.setUint16(10, 0, true)
    centralView.setUint16(12, dosTime, true)
    centralView.setUint16(14, dosDate, true)
    centralView.setUint32(16, crc, true)
    centralView.setUint32(20, size, true)
    centralView.setUint32(24, size, true)
    centralView.setUint16(28, nameBytes.length, true)
    centralView.setUint32(42, offset, true)
    central.set(nameBytes, 46)
    centralParts.push(central)
    offset += local.length + size
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0)
  const end = new Uint8Array(22)
  const endView = new DataView(end.buffer)
  endView.setUint32(0, 0x06054b50, true)
  endView.setUint16(8, entries.length, true)
  endView.setUint16(10, entries.length, true)
  endView.setUint32(12, centralSize, true)
  endView.setUint32(16, offset, true)

  const parts = [...localParts, ...centralParts, end]
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const output = new Uint8Array(total)
  let cursor = 0
  for (const part of parts) {
    output.set(part, cursor)
    cursor += part.length
  }
  return output
}
import fs from "node:fs"
import path from "node:path"


export interface StoreZipFileEntry {
  name: string
  path: string
}

function crc32File(filePath: string): number {
  const buffer = Buffer.allocUnsafe(1024 * 1024)
  const fd = fs.openSync(filePath, "r")
  let value = ~0
  try {
    while (true) {
      const read = fs.readSync(fd, buffer, 0, buffer.length, null)
      if (read <= 0) break
      for (let index = 0; index < read; index += 1) {
        value ^= buffer[index]
        for (let bit = 0; bit < 8; bit += 1) {
          value = (value >>> 1) ^ (0xedb88320 & -(value & 1))
        }
      }
    }
  } finally {
    fs.closeSync(fd)
  }
  return ~value >>> 0
}

/**
 * 成片包视频可能达到数百 MB，不能整包读进内存。
 * 这里按 store 模式一边读文件一边写 ZIP，适合单机小团队交付。
 */
export function writeStoreZipFile(
  outputPath: string,
  entries: StoreZipFileEntry[],
): void {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  const encoder = new TextEncoder()
  const output = fs.openSync(outputPath, "w")
  const centralParts: Uint8Array[] = []
  const now = new Date()
  const dosTime = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xffff
  const dosDate = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xffff
  let offset = 0
  try {
    for (const entry of entries) {
      const name = normalizedEntryName(entry.name)
      const nameBytes = encoder.encode(name)
      const stat = fs.statSync(entry.path)
      if (!stat.isFile()) throw new Error(`ZIP 条目不是文件：${entry.name}`)
      const size = stat.size
      const crc = crc32File(entry.path)
      const local = new Uint8Array(30 + nameBytes.length)
      const localView = new DataView(local.buffer)
      localView.setUint32(0, 0x04034b50, true)
      localView.setUint16(4, 20, true)
      localView.setUint16(6, 0x0800, true)
      localView.setUint16(8, 0, true)
      localView.setUint16(10, dosTime, true)
      localView.setUint16(12, dosDate, true)
      localView.setUint32(14, crc, true)
      localView.setUint32(18, size, true)
      localView.setUint32(22, size, true)
      localView.setUint16(26, nameBytes.length, true)
      local.set(nameBytes, 30)
      fs.writeSync(output, local)

      const input = fs.openSync(entry.path, "r")
      const buffer = Buffer.allocUnsafe(1024 * 1024)
      try {
        while (true) {
          const read = fs.readSync(input, buffer, 0, buffer.length, null)
          if (read <= 0) break
          fs.writeSync(output, buffer, 0, read)
        }
      } finally {
        fs.closeSync(input)
      }

      const central = new Uint8Array(46 + nameBytes.length)
      const centralView = new DataView(central.buffer)
      centralView.setUint32(0, 0x02014b50, true)
      centralView.setUint16(4, 20, true)
      centralView.setUint16(6, 20, true)
      centralView.setUint16(8, 0x0800, true)
      centralView.setUint16(10, 0, true)
      centralView.setUint16(12, dosTime, true)
      centralView.setUint16(14, dosDate, true)
      centralView.setUint32(16, crc, true)
      centralView.setUint32(20, size, true)
      centralView.setUint32(24, size, true)
      centralView.setUint16(28, nameBytes.length, true)
      centralView.setUint32(42, offset, true)
      central.set(nameBytes, 46)
      centralParts.push(central)
      offset += local.length + size
    }

    const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0)
    for (const part of centralParts) fs.writeSync(output, part)
    const end = new Uint8Array(22)
    const endView = new DataView(end.buffer)
    endView.setUint32(0, 0x06054b50, true)
    endView.setUint16(8, entries.length, true)
    endView.setUint16(10, entries.length, true)
    endView.setUint32(12, centralSize, true)
    endView.setUint32(16, offset, true)
    fs.writeSync(output, end)
  } finally {
    fs.closeSync(output)
  }
}

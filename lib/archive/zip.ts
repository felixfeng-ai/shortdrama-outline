const UTF8_FLAG = 0x0800

function u16(view: DataView, offset: number): number {
  if (offset < 0 || offset + 2 > view.byteLength) throw new Error("ZIP 文件结构不完整")
  return view.getUint16(offset, true)
}

function u32(view: DataView, offset: number): number {
  if (offset < 0 || offset + 4 > view.byteLength) throw new Error("ZIP 文件结构不完整")
  return view.getUint32(offset, true)
}

function decodeName(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch {
    throw new Error("ZIP 文件名编码不正确")
  }
}

function validateEntryPath(path: string): void {
  const normalized = path.replaceAll("\\", "/")
  if (
    !normalized ||
    normalized.startsWith("/") ||
    normalized.includes("\u0000") ||
    normalized.split("/").some((part) => part === ".." || part === "")
  ) {
    throw new Error(`ZIP 路径非法：${path}`)
  }
}

export async function readStoreZip(blob: Blob): Promise<Map<string, Uint8Array>> {
  const buffer = new Uint8Array(await blob.arrayBuffer())
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
  let eocd = -1
  const start = Math.max(0, buffer.length - 65_557)
  for (let offset = buffer.length - 22; offset >= start; offset -= 1) {
    if (u32(view, offset) === 0x06054b50) {
      eocd = offset
      break
    }
  }
  if (eocd < 0) throw new Error("不是有效的 ZIP 文件")

  const count = u16(view, eocd + 10)
  const centralOffset = u32(view, eocd + 16)
  const entries = new Map<string, Uint8Array>()
  let offset = centralOffset

  for (let index = 0; index < count; index += 1) {
    if (u32(view, offset) !== 0x02014b50) throw new Error("ZIP 中央目录损坏")
    const flags = u16(view, offset + 8)
    const method = u16(view, offset + 10)
    const compressedSize = u32(view, offset + 20)
    const uncompressedSize = u32(view, offset + 24)
    const nameLength = u16(view, offset + 28)
    const extraLength = u16(view, offset + 30)
    const commentLength = u16(view, offset + 32)
    const localOffset = u32(view, offset + 42)
    const nameStart = offset + 46
    const nameEnd = nameStart + nameLength
    if (nameEnd > buffer.length) throw new Error("ZIP 文件名越界")
    const name = decodeName(buffer.subarray(nameStart, nameEnd))
    validateEntryPath(name)
    if (flags & 0x1) throw new Error("不支持加密 ZIP")
    if (method !== 0) throw new Error("仅支持应用导出的未压缩 ZIP")
    if (compressedSize !== uncompressedSize) throw new Error("ZIP 条目尺寸不一致")

    if (u32(view, localOffset) !== 0x04034b50) throw new Error("ZIP 本地文件头损坏")
    const localNameLength = u16(view, localOffset + 26)
    const localExtraLength = u16(view, localOffset + 28)
    const localNameStart = localOffset + 30
    const localNameEnd = localNameStart + localNameLength
    if (localNameEnd > buffer.length) throw new Error("ZIP 本地文件名越界")
    if (decodeName(buffer.subarray(localNameStart, localNameEnd)) !== name) {
      throw new Error("ZIP 本地文件名与中央目录不一致")
    }
    const dataStart = localOffset + 30 + localNameLength + localExtraLength
    const dataEnd = dataStart + compressedSize
    if (dataEnd > buffer.length) throw new Error("ZIP 文件内容越界")
    entries.set(name, buffer.slice(dataStart, dataEnd))

    offset = nameEnd + extraLength + commentLength
  }

  return entries
}

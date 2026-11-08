import type {
  NovelExportArtifact,
  NovelExportFormat,
  NovelExportInput,
} from "./types.ts"

interface ZipEntry {
  name: string
  bytes: Uint8Array
}

const encoder = new TextEncoder()

function safeName(value: string): string {
  return value.trim().replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").slice(0, 80)
    || "小说稿"
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

function disclosure(input: NovelExportInput): string {
  return [
    "AI 生成声明",
    `本作品由 ${input.model} 辅助生成，Prompt 版本：${input.promptVersion}。`,
    `导出状态：${input.status === "complete" ? "已完成" : "未完成，仅包含当前已完成章节"}。`,
    `来源快照：${input.sourceSnapshotIds.join("、") || "无"}。`,
    "导出前应由作者完成事实核验、风格修订与平台合规检查。",
  ].join("\n")
}

function markdown(input: NovelExportInput): string {
  const chapters = input.chapters.map((chapter) =>
    `## 第 ${chapter.number} 章 ${chapter.title}\n\n${chapter.content.trim()}`
  ).join("\n\n---\n\n")
  return `# ${input.title}\n\n> ${input.presetLabel} · ${input.chapters.length} 章\n\n${chapters}\n\n---\n\n${disclosure(input)}\n`
}

function plainText(input: NovelExportInput): string {
  const chapters = input.chapters.map((chapter) =>
    `第 ${chapter.number} 章 ${chapter.title}\n\n${chapter.content.trim()}`
  ).join("\n\n")
  return `${input.title}\n${input.presetLabel} · ${input.chapters.length} 章\n\n${chapters}\n\n${disclosure(input)}\n`
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let index = 0; index < 256; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1)
    }
    table[index] = value >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function writeU16(target: Uint8Array, offset: number, value: number): void {
  target[offset] = value & 0xff
  target[offset + 1] = (value >>> 8) & 0xff
}

function writeU32(target: Uint8Array, offset: number, value: number): void {
  target[offset] = value & 0xff
  target[offset + 1] = (value >>> 8) & 0xff
  target[offset + 2] = (value >>> 16) & 0xff
  target[offset + 3] = (value >>> 24) & 0xff
}

/** 无压缩 ZIP 足够承载文本、DOCX 和 EPUB，且不引入服务端依赖。 */
function zip(entries: ZipEntry[]): Uint8Array {
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0
  const now = new Date()
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2)
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()

  for (const entry of entries) {
    const name = encoder.encode(entry.name)
    const crc = crc32(entry.bytes)
    const local = new Uint8Array(30 + name.length + entry.bytes.length)
    writeU32(local, 0, 0x04034b50)
    writeU16(local, 4, 20)
    writeU16(local, 6, 0)
    writeU16(local, 8, 0)
    writeU16(local, 10, dosTime)
    writeU16(local, 12, dosDate)
    writeU32(local, 14, crc)
    writeU32(local, 18, entry.bytes.length)
    writeU32(local, 22, entry.bytes.length)
    writeU16(local, 26, name.length)
    writeU16(local, 28, 0)
    local.set(name, 30)
    local.set(entry.bytes, 30 + name.length)
    locals.push(local)

    const central = new Uint8Array(46 + name.length)
    writeU32(central, 0, 0x02014b50)
    writeU16(central, 4, 20)
    writeU16(central, 6, 20)
    writeU16(central, 8, 0)
    writeU16(central, 10, 0)
    writeU16(central, 12, dosTime)
    writeU16(central, 14, dosDate)
    writeU32(central, 16, crc)
    writeU32(central, 20, entry.bytes.length)
    writeU32(central, 24, entry.bytes.length)
    writeU16(central, 28, name.length)
    writeU16(central, 30, 0)
    writeU16(central, 32, 0)
    writeU16(central, 34, 0)
    writeU16(central, 36, 0)
    writeU32(central, 38, 0)
    writeU32(central, 42, offset)
    central.set(name, 46)
    centrals.push(central)
    offset += local.length
  }

  const centralSize = centrals.reduce((sum, item) => sum + item.length, 0)
  const end = new Uint8Array(22)
  writeU32(end, 0, 0x06054b50)
  writeU16(end, 4, 0)
  writeU16(end, 6, 0)
  writeU16(end, 8, entries.length)
  writeU16(end, 10, entries.length)
  writeU32(end, 12, centralSize)
  writeU32(end, 16, offset)
  writeU16(end, 20, 0)

  const total = offset + centralSize + end.length
  const output = new Uint8Array(total)
  let cursor = 0
  for (const item of [...locals, ...centrals, end]) {
    output.set(item, cursor)
    cursor += item.length
  }
  return output
}

function paragraphs(content: string): string {
  return content.split(/\n+/).filter(Boolean).map((line) =>
    `<w:p><w:r><w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r></w:p>`
  ).join("")
}

function docx(input: NovelExportInput): Uint8Array {
  const body = input.chapters.map((chapter) =>
    `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>第 ${chapter.number} 章 ${escapeXml(chapter.title)}</w:t></w:r></w:p>${paragraphs(chapter.content)}`
  ).join("")
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>${body}<w:p><w:r><w:t>${escapeXml(disclosure(input))}</w:t></w:r></w:p><w:sectPr/></w:body>
</w:document>`
  return zip([
    {
      name: "[Content_Types].xml",
      bytes: encoder.encode(`<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`),
    },
    {
      name: "_rels/.rels",
      bytes: encoder.encode(`<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`),
    },
    { name: "word/document.xml", bytes: encoder.encode(documentXml) },
  ])
}

function xhtmlPage(title: string, body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>${escapeXml(title)}</title></head><body>${body}</body></html>`
}

function epub(input: NovelExportInput): Uint8Array {
  const chapterFiles = input.chapters.map((chapter, index) => ({
    id: `chapter-${index + 1}`,
    href: `chapter-${index + 1}.xhtml`,
    title: `第 ${chapter.number} 章 ${chapter.title}`,
    html: xhtmlPage(
      `${input.title} · 第 ${chapter.number} 章`,
      `<h1>第 ${chapter.number} 章 ${escapeXml(chapter.title)}</h1>${chapter.content.split(/\n+/).map((line) =>
        `<p>${escapeXml(line)}</p>`).join("")}`,
    ),
  }))
  const nav = xhtmlPage(
    input.title,
    `<nav epub:type="toc" xmlns:epub="http://www.idpf.org/2007/ops"><h1>${escapeXml(input.title)}</h1><ol>${chapterFiles.map((chapter) =>
      `<li><a href="${chapter.href}">${escapeXml(chapter.title)}</a></li>`).join("")}</ol></nav>`,
  )
  const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="book-id">veyatv-${escapeXml(input.title)}</dc:identifier>
<dc:title>${escapeXml(input.title)}</dc:title><dc:language>zh-CN</dc:language>
<meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d{3}Z$/, "Z")}</meta>
</metadata>
<manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
${chapterFiles.map((chapter) => `<item id="${chapter.id}" href="${chapter.href}" media-type="application/xhtml+xml"/>`).join("")}
</manifest>
<spine>${chapterFiles.map((chapter) => `<itemref idref="${chapter.id}"/>`).join("")}</spine>
</package>`
  return zip([
    { name: "mimetype", bytes: encoder.encode("application/epub+zip") },
    {
      name: "META-INF/container.xml",
      bytes: encoder.encode(`<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`),
    },
    { name: "OEBPS/content.opf", bytes: encoder.encode(opf) },
    { name: "OEBPS/nav.xhtml", bytes: encoder.encode(nav) },
    ...chapterFiles.map((chapter) => ({
      name: `OEBPS/${chapter.href}`,
      bytes: encoder.encode(chapter.html),
    })),
  ])
}

export function buildNovelExport(
  input: NovelExportInput,
  format: NovelExportFormat,
): NovelExportArtifact {
  const stem = safeName(input.title)
  const manifest = {
    schema: "chengju.novel",
    schemaVersion: 1,
    title: input.title,
    preset: input.presetLabel,
    status: input.status,
    model: input.model,
    promptVersion: input.promptVersion,
    sourceSnapshotIds: input.sourceSnapshotIds,
    chapterCount: input.chapters.length,
    exportedAt: new Date().toISOString(),
    aiDisclosure: disclosure(input),
  }
  if (format === "md") {
    return {
      filename: `${stem}.md`,
      mime: "text/markdown; charset=utf-8",
      bytes: encoder.encode(markdown(input)),
    }
  }
  if (format === "txt") {
    return {
      filename: `${stem}.txt`,
      mime: "text/plain; charset=utf-8",
      bytes: encoder.encode(plainText(input)),
    }
  }
  if (format === "docx") {
    return {
      filename: `${stem}.docx`,
      mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      bytes: docx(input),
    }
  }
  if (format === "epub") {
    return {
      filename: `${stem}.epub`,
      mime: "application/epub+zip",
      bytes: epub(input),
    }
  }
  const bytes = zip([
    { name: `${stem}.md`, bytes: encoder.encode(markdown(input)) },
    { name: `${stem}.txt`, bytes: encoder.encode(plainText(input)) },
    { name: "novel-manifest.json", bytes: encoder.encode(JSON.stringify(manifest, null, 2)) },
    { name: "ai-provenance.json", bytes: encoder.encode(JSON.stringify({
      generated: true,
      model: input.model,
      promptVersion: input.promptVersion,
      sourceSnapshotIds: input.sourceSnapshotIds,
      disclosure: disclosure(input),
    }, null, 2)) },
  ])
  return { filename: `${stem}.zip`, mime: "application/zip", bytes }
}

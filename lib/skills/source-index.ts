export interface SourceMaterialInput {
  id: string
  name: string
  kind: string
  characterCount: number
  content?: string
  chunkCount?: number
}

export interface SourceChunk {
  index: number
  title: string
  content: string
  characterCount: number
}

export interface SourceMaterialIndex {
  materialId: string
  name: string
  kind: string
  coveredCharacters: number
  chunks: SourceChunk[]
}

export const DEFAULT_SOURCE_CHUNK_CHARS = 6_000

const CHAPTER_HEADING = /^(?:第[0-9一二三四五六七八九十百千万两]+[章节卷回幕]|序章|楔子|尾声|Chapter\s+\d+).*$/gim

function splitLongSection(
  content: string,
  title: string,
  maxChars: number,
): { title: string; content: string }[] {
  const chars = Array.from(content)
  if (chars.length <= maxChars) return [{ title, content }]

  const pieces: { title: string; content: string }[] = []
  let offset = 0
  let part = 1
  while (offset < chars.length) {
    let end = Math.min(chars.length, offset + maxChars)
    if (end < chars.length) {
      const window = chars.slice(offset, end).join("")
      const breakAt = Math.max(window.lastIndexOf("\n\n"), window.lastIndexOf("。"), window.lastIndexOf("\n"))
      if (breakAt > maxChars * 0.55) end = offset + Array.from(window.slice(0, breakAt + 1)).length
    }
    const text = chars.slice(offset, end).join("").trim()
    if (text) pieces.push({ title: `${title} · 片段 ${part}`, content: text })
    offset = end
    part += 1
  }
  return pieces
}

export function buildSourceIndex(
  material: SourceMaterialInput,
  maxChars = DEFAULT_SOURCE_CHUNK_CHARS,
): SourceMaterialIndex {
  const content = (material.content ?? "").replace(/\r\n?/g, "\n")
  const headings = [...content.matchAll(CHAPTER_HEADING)]
  const sections: { title: string; content: string }[] = []

  if (headings.length > 0) {
    const first = headings[0].index ?? 0
    if (first > 0 && content.slice(0, first).trim()) {
      sections.push({ title: "正文开头", content: content.slice(0, first).trim() })
    }
    headings.forEach((match, index) => {
      const start = match.index ?? 0
      const end = headings[index + 1]?.index ?? content.length
      sections.push({
        title: match[0].trim(),
        content: content.slice(start, end).trim(),
      })
    })
  } else {
    const paragraphs = content.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean)
    let buffer = ""
    for (const paragraph of paragraphs) {
      if (buffer && Array.from(buffer).length + Array.from(paragraph).length + 2 > maxChars) {
        sections.push({ title: `段落 ${sections.length + 1}`, content: buffer })
        buffer = ""
      }
      buffer = buffer ? `${buffer}\n\n${paragraph}` : paragraph
    }
    if (buffer) sections.push({ title: "正文", content: buffer })
  }

  const chunks = sections
    .flatMap((section) => splitLongSection(section.content, section.title, maxChars))
    .map((chunk, index) => ({
      index,
      title: chunk.title,
      content: chunk.content,
      characterCount: Array.from(chunk.content).length,
    }))

  return {
    materialId: material.id,
    name: material.name,
    kind: material.kind,
    coveredCharacters: chunks.reduce((sum, chunk) => sum + chunk.characterCount, 0),
    chunks,
  }
}

export function listSourceMaterials(
  materials: readonly SourceMaterialInput[],
): string {
  if (materials.length === 0) return "当前项目还没有原文素材。"
  return materials.map((material) => {
    const chunks = material.chunkCount ?? buildSourceIndex(material).chunks.length
    return `${material.name}（${material.kind}，${material.characterCount} 字，${chunks} 个章节/片段，索引 0-${chunks - 1}）`
  }).join("\n")
}

export function readSourceChunk(
  materials: readonly SourceMaterialInput[],
  materialId: string,
  chunkIndex: number,
): { ok: boolean; title: string; content: string } {
  const material = materials.find((item) => item.id === materialId)
  if (!material) {
    return { ok: false, title: "", content: "没有找到这份项目原文，请先调用 list_source_materials。" }
  }
  if (!material.content?.trim()) {
    return { ok: false, title: "", content: "这段原文需要按需读取。" }
  }
  const index = buildSourceIndex(material)
  const chunk = index.chunks[Math.floor(chunkIndex)]
  if (!chunk) {
    return {
      ok: false,
      title: "",
      content: `章节索引不存在：${material.name} 只有 0-${index.chunks.length - 1}。`,
    }
  }
  return {
    ok: true,
    title: chunk.title,
    content: chunk.content,
  }
}

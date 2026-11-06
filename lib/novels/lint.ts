export type NovelLintCode =
  | "production-leak"
  | "mechanical-pattern"
  | "repetition"
  | "placeholder"
  | "truncated"
  | "word-count"
  | "weak-hook"

export interface NovelLintIssue {
  code: NovelLintCode
  severity: "blocking" | "warning"
  message: string
  excerpt?: string
}

export interface NovelLintReport {
  wordCount: number
  blocking: number
  warning: number
  issues: NovelLintIssue[]
}

const PRODUCTION_TERMS = [
  "分镜",
  "景别",
  "运镜",
  "首帧",
  "尾帧",
  "提示词",
  "Prompt",
  "prompt",
  "画幅",
  "镜头编号",
]

const PLACEHOLDER_TERMS = ["TODO", "待补", "此处省略", "TODO:", "Lorem ipsum", "……待续"]

function chineseLength(content: string): number {
  return Array.from(content.replace(/\s+/g, "")).length
}

/** 只找可稳定复现的问题；语义判断留给模型层，并必须由用户确认。 */
export function auditNovelChapter(input: {
  content: string
  targetWords: number
  hook: string
}): NovelLintReport {
  const content = String(input.content ?? "")
  const wordCount = chineseLength(content)
  const issues: NovelLintIssue[] = []

  for (const term of PRODUCTION_TERMS) {
    const index = content.indexOf(term)
    if (index >= 0) {
      issues.push({
        code: "production-leak",
        severity: "blocking",
        message: `正文出现制作流程词「${term}」，需要改写成小说语言`,
        excerpt: content.slice(Math.max(0, index - 16), index + term.length + 16),
      })
      break
    }
  }

  const mechanical = content.match(/不是[^。！？\n]{1,40}，?而是[^。！？\n]{1,40}/g) ?? []
  if (mechanical.length >= 2) {
    issues.push({
      code: "mechanical-pattern",
      severity: "warning",
      message: `连续使用 ${mechanical.length} 次“不是……而是……”句式，节奏过于机械`,
      excerpt: mechanical.slice(0, 2).join(" / "),
    })
  }

  const chunks = content.match(/[\u4e00-\u9fff]{8,}/g) ?? []
  const repeats = new Map<string, number>()
  for (const chunk of chunks) {
    if (chunk.length > 30) continue
    repeats.set(chunk, (repeats.get(chunk) ?? 0) + 1)
  }
  const repeated = [...repeats.entries()].find(([, count]) => count >= 3)
  if (repeated) {
    issues.push({
      code: "repetition",
      severity: "warning",
      message: `同一表达重复出现 ${repeated[1]} 次，建议合并或改写`,
      excerpt: repeated[0],
    })
  }

  const placeholder = PLACEHOLDER_TERMS.find((term) => content.includes(term))
  if (placeholder) {
    issues.push({
      code: "placeholder",
      severity: "blocking",
      message: `正文仍有占位内容「${placeholder}」`,
    })
  }

  if (content.trim() && !/[。！？…”』」]$/.test(content.trim())) {
    issues.push({
      code: "truncated",
      severity: "blocking",
      message: "正文结尾不完整，可能被截断",
    })
  }

  if (input.targetWords > 0 && wordCount < input.targetWords * 0.55) {
    issues.push({
      code: "word-count",
      severity: "warning",
      message: `本章 ${wordCount} 字，明显低于目标 ${input.targetWords} 字`,
    })
  }

  if (!String(input.hook ?? "").trim()) {
    issues.push({
      code: "weak-hook",
      severity: "warning",
      message: "章节缺少明确的结尾钩子",
    })
  }

  return {
    wordCount,
    blocking: issues.filter((issue) => issue.severity === "blocking").length,
    warning: issues.filter((issue) => issue.severity === "warning").length,
    issues,
  }
}

// 导演意图卡：把"这部片想成为什么"变成项目状态，而不是留在聊天记录里。
//
// 设计纪律（见 JUDGMENT.md）：
// - 只收 4 个字段，不照搬外部 creative brief 的 9 节表单。
// - 空意图必须产生"零 prompt 片段"，保证与旧行为逐字节一致。
// - 它是倾向，不覆盖三幕结构、情节点数量、场次下限这些硬要求。

export interface CreativeBrief {
  /** 核心情绪，例如「克制、压抑」 */
  emotion: string
  /** 目标观众，例如「25-35 女性」 */
  audience: string
  /** 参考气质，最多 3 个，用顿号连接 */
  references: string
  /** 不希望作品变成什么（红线） */
  redline: string
}

export const EMPTY_BRIEF: CreativeBrief = {
  emotion: '',
  audience: '',
  references: '',
  redline: '',
}

const FIELD_LIMIT = 60
const REDLINE_LIMIT = 100

function clean(value: unknown, max = FIELD_LIMIT): string {
  return typeof value === 'string'
    ? value.trim().replace(/\s+/g, ' ').slice(0, max)
    : ''
}

/** 参考片只留 3 个，逗号/顿号/分号/换行都视为分隔符 */
function cleanReferences(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value
    .split(/[、,，;；\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join('、')
}

export function readBrief(value: unknown): CreativeBrief {
  const v = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
  return {
    emotion: clean(v.emotion),
    audience: clean(v.audience),
    references: cleanReferences(v.references),
    redline: clean(v.redline, REDLINE_LIMIT),
  }
}

export function isBriefEmpty(brief: CreativeBrief | undefined): boolean {
  if (!brief) return true
  return !brief.emotion && !brief.audience && !brief.references && !brief.redline
}

/** 用于过期判定：任何字段变了，下游就该标「基于旧意图」 */
export function briefSignature(brief: CreativeBrief): string {
  return [brief.emotion, brief.audience, brief.references, brief.redline].join('|')
}

/** 空意图返回空串——这是"与旧行为一致"的硬保证 */
export function briefPromptBlock(brief: CreativeBrief | undefined): string {
  if (!brief || isBriefEmpty(brief)) return ''
  const lines = [
    brief.emotion && `- 核心情绪：${brief.emotion}`,
    brief.audience && `- 目标观众：${brief.audience}`,
    brief.references && `- 参考气质：${brief.references}`,
    brief.redline && `- 不要变成：${brief.redline}`,
  ].filter(Boolean)
  return `\n\n## 创作意图（倾向，不覆盖结构要求）\n${lines.join('\n')}`
}

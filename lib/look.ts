// 视觉宪法（Look Book）：角色锚点管"同一个人"，这里管"同一部片"。
//
// 与意图卡一样：空值必须产生零 prompt 片段，保证与旧行为一致。
// 只在分镜提示词里注入——角色锚点已经逐镜注入，两者互补，不重复。

export interface LookBook {
  /** 色调，例如「冷蓝、低饱和」 */
  palette: string
  /** 光线，例如「单一暖光源、硬阴影」 */
  light: string
  /** 镜头语言，例如「长焦压缩、手持轻微晃动」 */
  lens: string
  /** 不要出现的东西 */
  banned: string
}

export const EMPTY_LOOK: LookBook = { palette: '', light: '', lens: '', banned: '' }

const LIMIT = 60

function clean(value: unknown, max = LIMIT): string {
  return typeof value === 'string'
    ? value.trim().replace(/\s+/g, ' ').slice(0, max)
    : ''
}

export function readLook(value: unknown): LookBook {
  const v = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
  return {
    palette: clean(v.palette),
    light: clean(v.light),
    lens: clean(v.lens),
    banned: clean(v.banned),
  }
}

export function isLookEmpty(look: LookBook | undefined): boolean {
  if (!look) return true
  return !look.palette && !look.light && !look.lens && !look.banned
}

export function lookSignature(look: LookBook): string {
  return [look.palette, look.light, look.lens, look.banned].join('|')
}

export function lookPromptBlock(look: LookBook | undefined): string {
  if (!look || isLookEmpty(look)) return ''
  const lines = [
    look.palette && `- 色调：${look.palette}`,
    look.light && `- 光线：${look.light}`,
    look.lens && `- 镜头语言：${look.lens}`,
    look.banned && `- 不要出现：${look.banned}`,
  ].filter(Boolean)
  return `\n\n## 视觉宪法（逐镜遵守）\n${lines.join('\n')}`
}

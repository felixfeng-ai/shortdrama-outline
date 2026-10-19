// 判断日志：记录"为什么换掉/重跑/否决"，而不是只留结果。
//
// 存储纪律（见 specs/judgment-log/spec.md）：
// - 默认本地，不静默上传。
// - 不强制填写理由；一条记录可以在 1 次点击内完成。
// - 只把最近 10 条喂给场记，避免把整份历史塞进上下文。

export interface JudgmentEntry {
  id: string
  at: number
  /** 步骤 key 或 'agent' / 'other' */
  step: string
  /** 发生了什么，例如「换一个角色」「重新生成分集」 */
  action: string
  /** 可选的一句理由 */
  reason: string
}

export const MAX_JUDGMENTS = 10
const REASON_LIMIT = 120

function text(value: unknown, max = 40): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : ''
}

export function readJudgments(value: unknown): JudgmentEntry[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((v): v is Record<string, unknown> => !!v && typeof v === 'object')
    .filter((v) => typeof v.step === 'string' && typeof v.action === 'string')
    .map((v, i) => ({
      id: typeof v.id === 'string' ? v.id : `j-${i}`,
      at: typeof v.at === 'number' && Number.isFinite(v.at) ? v.at : 0,
      step: text(v.step, 20),
      action: text(v.action, 40),
      reason: text(v.reason, REASON_LIMIT),
    }))
    .slice(-MAX_JUDGMENTS)
}

export function appendJudgment(
  list: JudgmentEntry[],
  input: { step: string; action: string; reason?: string; now?: number },
): JudgmentEntry[] {
  const now = input.now ?? Date.now()
  const entry: JudgmentEntry = {
    id: `j-${now}-${Math.random().toString(36).slice(2, 6)}`,
    at: now,
    step: text(input.step, 20),
    action: text(input.action, 40),
    reason: text(input.reason, REASON_LIMIT),
  }
  return [...list, entry].slice(-MAX_JUDGMENTS)
}

/** 空日志返回空串；只取最近 10 条 */
export function judgmentPromptBlock(list: JudgmentEntry[]): string {
  if (!list.length) return ''
  const lines = list
    .slice(-MAX_JUDGMENTS)
    .map((e) => `- [${e.step}] ${e.action}${e.reason ? `：${e.reason}` : ''}`)
  return `\n\n## 最近的判断（不要重复推荐已被否决的方向）\n${lines.join('\n')}`
}

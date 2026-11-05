function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function text(value: unknown, max = 120): string {
  return typeof value === "string" ? value.trim().slice(0, max) : ""
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(record) : []
}

export interface MobileAgentMemory {
  lockedCharacters: string[]
  lockedPlaces: string[]
  acceptedDecisions: string[]
  lockedDecisions: string[]
  rejectedDirections: string[]
  openComments: string[]
}

export const EMPTY_MOBILE_AGENT_MEMORY: MobileAgentMemory = {
  lockedCharacters: [],
  lockedPlaces: [],
  acceptedDecisions: [],
  lockedDecisions: [],
  rejectedDirections: [],
  openComments: [],
}

/**
 * 只把项目里已经存在、可解释的事实交给移动端记忆层。
 * 不把原始决策 JSON 或提示词全文塞进首页，避免 Agent 上下文变成管理面板。
 */
export function buildMobileAgentMemory(input: {
  visualCharacters?: unknown
  visualPlaces?: unknown
  decisions?: unknown
  judgments?: unknown
  comments?: unknown
}): MobileAgentMemory {
  const lockedCharacters = records(input.visualCharacters)
    .map((item) => [text(item.name), text(item.wardrobe), text(item.marks)].filter(Boolean).join(" · "))
    .filter(Boolean)
    .slice(0, 4)
  const lockedPlaces = records(input.visualPlaces)
    .map((item) => [text(item.name), text(item.space), text(item.lighting)].filter(Boolean).join(" · "))
    .filter(Boolean)
    .slice(0, 4)
  const decisions = records(input.decisions)
  const acceptedDecisions = decisions
    .filter((item) => !item.locked && item.status === "accepted")
    .map((item) => `${text(item.question)} → ${text(item.chosenValue)}`)
    .filter(Boolean)
    .slice(0, 4)
  const lockedDecisions = decisions
    .filter((item) => item.locked === true)
    .map((item) => `${text(item.question)} → ${text(item.chosenValue)}`)
    .filter(Boolean)
    .slice(0, 4)
  const judgments = records(input.judgments)
  const allDirections = judgments
    .map((item) => {
      const action = text(item.action)
      const reason = text(item.reason)
      return action ? `${action}${reason ? `：${reason}` : ""}` : ""
    })
    .filter(Boolean)
  const rejected = judgments
    .filter((item) => /否|放弃|不采用|退回/.test(`${text(item.action)} ${text(item.reason)}`))
    .map((item) => {
      const action = text(item.action)
      const reason = text(item.reason)
      return action ? `${action}${reason ? `：${reason}` : ""}` : ""
    })
    .filter(Boolean)
  const openComments = records(input.comments)
    .filter((item) => item.status !== "resolved")
    .map((item) => `${text(item.targetName) || "未命名镜头"}：${text(item.body, 200)}`)
    .filter((item) => !item.endsWith("："))
    .slice(0, 4)
  return {
    lockedCharacters,
    lockedPlaces,
    acceptedDecisions,
    lockedDecisions,
    rejectedDirections: (rejected.length > 0 ? rejected : allDirections).slice(0, 4),
    openComments,
  }
}

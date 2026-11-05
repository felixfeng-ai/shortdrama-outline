import type { AgentCard } from "./tools.ts"
import type { ArtifactKind } from "../assets/types.ts"

export type AgentActionKind = "shot-edit" | "entity-edit"

export interface AgentActionPlan {
  actionKind: AgentActionKind
  artifactKind: ArtifactKind
  targetType: "character" | "place" | "episode" | "shot"
  targetId: string
  targetLabel: string
  field: string
  fieldLabel: string
  summary: string
  before: string
  after: string
  impact: string[]
  rollbackable: true
}

const FIELD_LABELS: Record<string, string> = {
  action: "镜头动作",
  prompt: "镜头提示词",
  personality: "人物性格",
  space: "地点空间",
  synopsis: "剧情概要",
}

const ENTITY_ARTIFACT: Record<AgentActionPlan["targetType"], ArtifactKind> = {
  character: "characters",
  place: "visualPlaces",
  episode: "episodes",
  shot: "shots",
}

function targetLabelForEntity(card: Extract<AgentCard, { kind: "entity-edit" }>): string {
  if (card.targetType === "character") return `人物 · ${card.targetName}`
  if (card.targetType === "place") return `地点 · ${card.targetName}`
  if (card.targetType === "episode") return `分集 · ${card.targetName}`
  return `镜头 · ${card.targetName}`
}

/**
 * 把可写 AgentCard 转成用户能核对的执行计划。
 *
 * 只读卡、预算卡和生成任务卡返回 null：它们没有可直接回滚的文本写入，
 * 不能在执行记录里伪装成同一种动作。
 */
export function buildAgentActionPlan(card: AgentCard): AgentActionPlan | null {
  if (card.kind === "shot-edit") {
    return {
      actionKind: "shot-edit",
      artifactKind: "shots",
      targetType: "shot",
      targetId: card.targetId,
      targetLabel: card.targetLabel,
      field: card.target,
      fieldLabel: FIELD_LABELS[card.target] ?? card.target,
      summary: card.summary,
      before: card.expectedText,
      after: card.text,
      impact: [
        `写入 ${FIELD_LABELS[card.target] ?? card.target}`,
        "生成新版本快照",
        "保留前一版，可安全回滚",
      ],
      rollbackable: true,
    }
  }

  if (card.kind === "entity-edit") {
    return {
      actionKind: "entity-edit",
      artifactKind: ENTITY_ARTIFACT[card.targetType],
      targetType: card.targetType,
      targetId: card.targetId,
      targetLabel: targetLabelForEntity(card),
      field: card.field,
      fieldLabel: FIELD_LABELS[card.field] ?? card.field,
      summary: card.summary,
      before: card.expectedText,
      after: card.text,
      impact: [
        `写入 ${FIELD_LABELS[card.field] ?? card.field}`,
        "生成新版本快照",
        "保留前一版，可安全回滚",
      ],
      rollbackable: true,
    }
  }

  return null
}

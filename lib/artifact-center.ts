import type { AgentCard } from "@/lib/agent/tools"
import type { SnapshotDto } from "@/lib/assets/api"
import type { ArtifactKind } from "@/lib/assets/types"

export interface ArtifactKindMeta {
  kind: ArtifactKind
  label: string
  description: string
}

/**
 * 项目产物的固定展示顺序。
 *
 * 这里只负责“怎么给人看”，真实快照白名单仍以 ARTIFACT_KINDS 为唯一来源。
 * 两边通过 ArtifactKind 类型绑定，漏掉一种会在 TypeScript 编译时暴露。
 */
export const ARTIFACT_KIND_META: readonly ArtifactKindMeta[] = [
  { kind: "idea", label: "故事", description: "创作想法与题材起点" },
  { kind: "characters", label: "人物", description: "核心人物与关系动机" },
  { kind: "acts", label: "三幕", description: "全剧结构与阶段推进" },
  { kind: "episodes", label: "分集", description: "每集剧情与结尾钩子" },
  { kind: "visualCharacters", label: "定妆", description: "跨镜稳定的角色视觉锚点" },
  { kind: "scenes", label: "场次", description: "地点、时间与出场人物" },
  { kind: "visualPlaces", label: "地点", description: "跨场次复用的空间视觉锚点" },
  { kind: "shots", label: "分镜", description: "镜头动作、台词与生成参数" },
] as const

export interface ArtifactSnapshotSummary<T = unknown> {
  latest: SnapshotDto<T> | null
  history: SnapshotDto<T>[]
  version: number | null
  itemCount: number
  updatedAt: number | null
}

export function countArtifactItems(payload: unknown): number {
  if (payload == null) return 0
  if (typeof payload === "string") return payload.trim() ? 1 : 0
  if (Array.isArray(payload)) return payload.length
  if (typeof payload !== "object") return 1

  const record = payload as Record<string, unknown>
  if (typeof record.idea === "string") return record.idea.trim() ? 1 : 0
  if (Array.isArray(record.items)) return record.items.length
  return Object.keys(record).length > 0 ? 1 : 0
}

export function summarizeArtifactSnapshots<T>(
  snapshots: SnapshotDto<T>[],
): ArtifactSnapshotSummary<T> {
  const history = [...snapshots].sort((a, b) =>
    b.version - a.version || b.createdAt - a.createdAt
  )
  const latest = history[0] ?? null
  return {
    latest,
    history,
    version: latest?.version ?? null,
    itemCount: latest ? countArtifactItems(latest.payload) : 0,
    updatedAt: latest?.createdAt ?? null,
  }
}

export type ArtifactDiffKind = "added" | "removed" | "changed"

export interface ArtifactDiff {
  path: string
  kind: ArtifactDiffKind
  before: string
  after: string
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function compactValue(value: unknown): string {
  if (value === undefined) return ""
  if (value == null) return "null"
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  try {
    const text = JSON.stringify(value)
    return text.length > 160 ? `${text.slice(0, 157)}...` : text
  } catch {
    return String(value)
  }
}

function pushDiff(
  target: ArtifactDiff[],
  path: string,
  kind: ArtifactDiffKind,
  before: unknown,
  after: unknown,
  limit: number,
) {
  if (target.length >= limit) return
  target.push({
    path,
    kind,
    before: compactValue(before),
    after: compactValue(after),
  })
}

function stableItemKey(value: unknown): string | null {
  if (!isPlainObject(value)) return null
  for (const key of ["entityId", "id"]) {
    const candidate = value[key]
    if (typeof candidate === "string" && candidate.length > 0) return candidate
  }
  return null
}

function stableArrayKeys(before: unknown[], after: unknown[]): string[] | null {
  const beforeKeys = before.map(stableItemKey)
  const afterKeys = after.map(stableItemKey)
  if (!beforeKeys.every((key): key is string => Boolean(key))) return null
  if (!afterKeys.every((key): key is string => Boolean(key))) return null
  if (new Set(beforeKeys).size !== beforeKeys.length) return null
  if (new Set(afterKeys).size !== afterKeys.length) return null
  return [...new Set([...beforeKeys, ...afterKeys])]
}

function walkDiff(
  before: unknown,
  after: unknown,
  path: string,
  target: ArtifactDiff[],
  limit: number,
) {
  if (target.length >= limit) return
  if (Object.is(before, after)) return

  if (Array.isArray(before) && Array.isArray(after)) {
    const stableKeys = stableArrayKeys(before, after)
    if (stableKeys) {
      const beforeMap = new Map(
        before.map((item, index) => [stableItemKey(item)!, item] as const),
      )
      const afterMap = new Map(
        after.map((item, index) => [stableItemKey(item)!, item] as const),
      )
      for (const key of stableKeys) {
        if (target.length >= limit) break
        const itemPath = `${path}[${key}]`
        if (!beforeMap.has(key)) pushDiff(target, itemPath, "added", undefined, afterMap.get(key), limit)
        else if (!afterMap.has(key)) pushDiff(target, itemPath, "removed", beforeMap.get(key), undefined, limit)
        else walkDiff(beforeMap.get(key), afterMap.get(key), itemPath, target, limit)
      }
      return
    }

    const length = Math.max(before.length, after.length)
    for (let index = 0; index < length && target.length < limit; index += 1) {
      const itemPath = `${path}[${index}]`
      if (index >= before.length) pushDiff(target, itemPath, "added", undefined, after[index], limit)
      else if (index >= after.length) pushDiff(target, itemPath, "removed", before[index], undefined, limit)
      else walkDiff(before[index], after[index], itemPath, target, limit)
    }
    return
  }

  if (isPlainObject(before) && isPlainObject(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)])
    for (const key of keys) {
      if (target.length >= limit) break
      const itemPath = path === "$" ? `$.${key}` : `${path}.${key}`
      if (!(key in before)) pushDiff(target, itemPath, "added", undefined, after[key], limit)
      else if (!(key in after)) pushDiff(target, itemPath, "removed", before[key], undefined, limit)
      else walkDiff(before[key], after[key], itemPath, target, limit)
    }
    return
  }

  pushDiff(target, path, "changed", before, after, limit)
}

/**
 * 对比两版真实 payload。
 *
 * 数组按位置比较而不是猜业务 id：镜号、场号和旧数据没有稳定 id 时，
 * 位置差异仍然可核验；不做相似度评分，也不替用户判断“改得好不好”。
 */
export function diffArtifactPayloads(
  before: unknown,
  after: unknown,
  limit = 40,
): ArtifactDiff[] {
  const changes: ArtifactDiff[] = []
  walkDiff(before, after, "$", changes, Math.max(1, limit))
  return changes
}

export interface AgentCardDescription {
  type: string
  target: string
  summary: string
  nextAction: string
}

function stepTarget(label: string): string {
  return label || "当前步骤"
}

export function describeAgentCard(card: AgentCard): AgentCardDescription {
  if (card.kind === "shot-edit") {
    return {
      type: "镜头改写",
      target: card.targetLabel,
      summary: card.summary,
      nextAction: "打开 Agent 确认后写入镜头",
    }
  }
  if (card.kind === "entity-edit") {
    return {
      type: "实体修改",
      target: card.targetName,
      summary: card.summary,
      nextAction: "打开 Agent 核对字段后确认",
    }
  }
  if (card.kind === "localization-edit") {
    return {
      type: "海外本地化",
      target: card.targetName,
      summary: card.summary,
      nextAction: "打开 Agent 核对原文与本地化文本",
    }
  }
  if (card.kind === "decision") {
    return {
      type: "创作决策",
      target: stepTarget(card.stepLabel),
      summary: `${card.question} 推荐「${card.recommended}」`,
      nextAction: "打开 Agent 确认后再落库",
    }
  }
  if (card.kind === "video-plan") {
    return {
      type: "视频预算",
      target: `${card.shotCount} 个镜头`,
      summary: `${card.model} · ${card.durationSeconds} 秒/镜 · ${card.resolution}`,
      nextAction: "打开 Agent 查看预算，不会自动创建任务",
    }
  }
  if (card.kind === "video-rework") {
    return {
      type: "视频返修",
      target: `第 ${card.episode} 集 · ${card.items.length} 镜`,
      summary: card.summary,
      nextAction: "打开 Agent 查看返修项",
    }
  }
  if (card.kind === "timeline-plan") {
    return {
      type: "时间线提案",
      target: `第 ${card.episode} 集`,
      summary: card.summary,
      nextAction: "打开 Agent 核对后处理",
    }
  }
  if (card.kind === "voice-plan") {
    return {
      type: "音色建议",
      target: `${card.bindings.length} 个角色`,
      summary: card.summary,
      nextAction: "打开 Agent 核对音色绑定",
    }
  }
  if (card.kind === "tts-plan") {
    return {
      type: "TTS 批量",
      target: `第 ${card.episode} 集 · ${card.lineCount} 句`,
      summary: card.summary,
      nextAction: "打开 Agent 核对预算与未绑定台词",
    }
  }
  if (card.kind === "render-plan") {
    return {
      type: "成片提案",
      target: `第 ${card.episode} 集`,
      summary: card.summary,
      nextAction: "打开 Agent 核对成片条件",
    }
  }
  if (card.kind === "command-plan") {
    return {
      type: "执行命令",
      target: card.title,
      summary: card.summary,
      nextAction: "打开 Agent 确认后执行",
    }
  }
  return {
    type: "重新生成",
    target: stepTarget(card.stepLabel),
    summary: card.reason,
    nextAction: "打开 Agent 确认后重跑",
  }
}

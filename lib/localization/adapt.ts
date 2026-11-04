import { createHash } from "node:crypto"
import type { DatabaseSync } from "node:sqlite"

import { InputError } from "../api.ts"
import { createSnapshot, getSnapshot, type Snapshot } from "../assets/repo.ts"
import { getLocalizationBranch } from "./branches.ts"
import type {
  BranchContext,
  GlossaryEntry,
} from "./context.ts"

export interface LocalizationSourceEpisode {
  episode: number
  title: string
  synopsis: string
  hook: string
}

export interface LocalizedEpisode {
  episode: number
  title: string
  localized: string
  hook: string
  source: string
  reason: string
  glossaryUsed: string[]
  risks: string[]
}

function text(value: unknown, max: number, preserveLines = false): string {
  if (typeof value !== "string") return ""
  return preserveLines
    ? value.trim().slice(0, max)
    : value.trim().replace(/\s+/g, " ").slice(0, max)
}

function textList(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map((item) => text(item, maxLength)).filter(Boolean))]
    .slice(0, maxItems)
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (!value || typeof value !== "object") return value
  const record = value as Record<string, unknown>
  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .filter((key) => record[key] !== undefined)
      .map((key) => [key, stableValue(record[key])]),
  )
}

export function buildLocalizationSignature(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(stableValue(value)))
    .digest("hex")
}

export function buildLocalizationPrompt(input: {
  context: BranchContext
  glossary: GlossaryEntry[]
  episodes: LocalizationSourceEpisode[]
}): { system: string; user: string } {
  const system = [
    "你是短剧海外本地化编剧，不是逐字翻译器。",
    "目标是把原剧情改成目标市场观众能直接理解和共情的版本，同时保留人物、动机、信息差和钩子。",
    "必须遵守锁定术语；不能发明原文没有的关键事实；不能删掉推动剧情的因果链。",
    "只输出 JSON 对象，不要解释。",
  ].join("\n")
  const glossary = input.glossary.length > 0
    ? input.glossary.map((entry) =>
      `- ${entry.source} => ${entry.target}${entry.locked ? "（必须逐字使用）" : ""}${entry.notes ? `；${entry.notes}` : ""}`
    ).join("\n")
    : "无锁定术语"
  const episodes = input.episodes.map((episode) =>
    [
      `第 ${episode.episode} 集：${episode.title}`,
      `梗概：${episode.synopsis}`,
      `钩子：${episode.hook}`,
    ].join("\n")
  ).join("\n\n")
  const user = [
    `目标市场：${input.context.profile.label}（${input.context.profile.locale}）`,
    `目标语言：${input.context.profile.language}`,
    `目标平台：${input.context.platforms.join("、") || input.context.profile.platforms.join("、")}`,
    `内容评级：${input.context.contentRating}`,
    `目标观众：${input.context.adaptationBrief.audience || "未填写"}`,
    `核心情绪：${input.context.adaptationBrief.emotion || "未填写"}`,
    `改编策略：${input.context.adaptationBrief.strategy || "保留剧情与钩子，改写文化梗和表达"}`,
    `红线：${input.context.adaptationBrief.redlines.join("；") || "无额外红线"}`,
    "",
    "锁定术语：",
    glossary,
    "",
    "原文分集：",
    episodes,
    "",
    "输出格式：",
    JSON.stringify({
      items: [{
        episode: 1,
        title: "localized title",
        localized: "localized synopsis",
        hook: "localized hook",
        source: "对应原文摘要",
        reason: "为什么这样改",
        glossaryUsed: ["原文术语"],
        risks: ["仍需人工确认的文化或视觉风险"],
      }],
    }),
  ].join("\n")
  return { system, user }
}

export function normalizeLocalizedEpisodes(value: unknown): LocalizedEpisode[] {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {}
  const items = Array.isArray(value)
    ? value
    : Array.isArray(source.items)
      ? source.items
      : []
  const normalized: LocalizedEpisode[] = []
  for (const item of items) {
    if (!item || typeof item !== "object") continue
    const row = item as Record<string, unknown>
    const episode = Number(row.episode)
    const localized = text(row.localized, 20_000, true)
    if (!Number.isInteger(episode) || episode < 1) throw new InputError("本地化结果缺少有效集数")
    if (!localized) throw new InputError("本地化正文不能为空")
    normalized.push({
      episode,
      title: text(row.title, 200),
      localized,
      hook: text(row.hook, 2_000),
      source: text(row.source, 20_000, true),
      reason: text(row.reason, 2_000, true),
      glossaryUsed: textList(row.glossaryUsed, 30, 300),
      risks: textList(row.risks, 30, 500),
    })
  }
  if (normalized.length === 0) throw new InputError("本地化结果为空")
  return normalized
}

/**
 * 用户确认后才调用。原始快照只作为父版本和合成基底，不会被修改。
 * 新快照写入 branch_id，失败时 createSnapshot 会抛错，调用方不得显示已保存。
 */
export function saveLocalizedEpisodes(
  db: DatabaseSync,
  projectId: string,
  branchId: string,
  ownerId: string,
  sourceSnapshotId: string,
  items: LocalizedEpisode[],
  now = Date.now(),
): Snapshot {
  if (!getLocalizationBranch(db, projectId, branchId, ownerId)) {
    const error = new Error("本地化分支不存在或无权访问") as Error & { status: number }
    error.status = 403
    throw error
  }
  const source = getSnapshot(db, sourceSnapshotId)
  if (!source || source.projectId !== projectId || source.kind !== "episodes") {
    throw new InputError("本地化源分集快照不存在")
  }
  const sourceEpisodes = Array.isArray(source.payload)
    ? source.payload as Array<Record<string, unknown>>
    : []
  const byEpisode = new Map(items.map((item) => [item.episode, item]))
  const payload = sourceEpisodes.map((episode) => {
    const localized = byEpisode.get(Number(episode.number))
    if (!localized) return episode
    return {
      ...episode,
      title: localized.title || String(episode.title ?? ""),
      synopsis: localized.localized,
      hook: localized.hook || String(episode.hook ?? ""),
      localization: {
        source: localized.source,
        reason: localized.reason,
        glossaryUsed: localized.glossaryUsed,
        risks: localized.risks,
        savedAt: now,
      },
    }
  })
  return createSnapshot(db, {
    projectId,
    branchId,
    kind: "episodes",
    payload,
    parents: [source.id],
  })
}

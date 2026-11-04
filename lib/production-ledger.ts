import type { Shot } from "./assets/types.ts"
import type { ShotQcResult } from "./assets/qc.ts"
import type { EntityComment } from "./entity-comments.ts"
import type { GeneratedAsset, GenerationTask } from "./generation/types.ts"

export const PRODUCTION_LEDGER_SCHEMA = "chengju.production-ledger" as const

export interface ProductionLedgerComment {
  id: string
  body: string
  status: "open" | "resolved"
  authorLabel: string
  createdAt: number
}

export interface ProductionLedgerTask {
  id: string
  status: GenerationTask["status"]
  error: string | null
  createdAt: number
  finishedAt: number | null
}

export interface ProductionLedgerRow {
  episode: number
  shot: number
  entityId: string
  scene: string
  status: Shot["status"]
  characters: string[]
  ratio: string
  duration: number
  qcIssues: string[]
  missingReferences: string[]
  openComments: number
  latestComment: string
  comments: ProductionLedgerComment[]
  latestTask: ProductionLedgerTask | null
  hasSelectedAsset: boolean
  selectedAssetAt: number | null
}

export interface ProductionLedger {
  schema: typeof PRODUCTION_LEDGER_SCHEMA
  schemaVersion: 1
  projectTitle: string
  generatedAt: number
  summary: {
    totalShots: number
    doneShots: number
    reworkShots: number
    todoShots: number
    issueShots: number
    missingReferenceShots: number
    openComments: number
    failedTasks: number
  }
  rows: ProductionLedgerRow[]
}

function latestByTarget<T extends { targetType: string; targetId: string; createdAt: number }>(
  items: T[],
): Map<string, T> {
  const latest = new Map<string, T>()
  for (const item of items) {
    const key = `${item.targetType}:${item.targetId}`
    const current = latest.get(key)
    if (!current || item.createdAt > current.createdAt) latest.set(key, item)
  }
  return latest
}

function selectedAssetByTarget(assets: GeneratedAsset[]): Map<string, GeneratedAsset> {
  const selected = new Map<string, GeneratedAsset>()
  for (const asset of assets) {
    if (asset.selectedAt === null) continue
    const key = `${asset.targetType}:${asset.targetId}`
    const current = selected.get(key)
    if (!current || asset.selectedAt > (current.selectedAt ?? 0)) selected.set(key, asset)
  }
  return selected
}

function commentLabel(authorId: string): string {
  const clean = authorId.trim()
  return `成员 ${clean.slice(-4) || "未知"}`
}

export function buildProductionLedger(input: {
  projectTitle: string
  generatedAt?: number
  shots: Shot[]
  qc: ShotQcResult[]
  comments: EntityComment[]
  tasks: GenerationTask[]
  assets: GeneratedAsset[]
}): ProductionLedger {
  const qcByShot = new Map(input.qc.map((item) => [item.entityId, item]))
  const latestTask = latestByTarget(input.tasks.filter((task) => task.targetType === "shot"))
  const selectedAsset = selectedAssetByTarget(
    input.assets.filter((asset) => asset.targetType === "shot"),
  )

  const rows = input.shots.map((shot) => {
    const shotComments = input.comments
      .filter((comment) =>
        comment.targetType === "shot"
        && comment.targetId === shot.entityId
      )
      .sort((left, right) => right.createdAt - left.createdAt)
      .map((comment) => ({
        id: comment.id,
        body: comment.body,
        status: comment.status,
        authorLabel: commentLabel(comment.authorId),
        createdAt: comment.createdAt,
      }))
    const task = latestTask.get(`shot:${shot.entityId}`)
    const asset = selectedAsset.get(`shot:${shot.entityId}`)
    const qcIssues = qcByShot.get(shot.entityId)?.issues.map((issue) => issue.message) ?? []
    return {
      episode: shot.episode,
      shot: shot.shot,
      entityId: shot.entityId,
      scene: shot.scene,
      status: shot.status,
      characters: shot.characters,
      ratio: shot.params.ratio,
      duration: shot.params.duration,
      qcIssues,
      missingReferences: shot.missingRefFor,
      openComments: shotComments.filter((comment) => comment.status === "open").length,
      latestComment: shotComments[0]?.body ?? "",
      comments: shotComments,
      latestTask: task
        ? {
          id: task.id,
          status: task.status,
          error: task.error,
          createdAt: task.createdAt,
          finishedAt: task.finishedAt,
        }
        : null,
      hasSelectedAsset: Boolean(asset),
      selectedAssetAt: asset?.selectedAt ?? null,
    }
  })

  return {
    schema: PRODUCTION_LEDGER_SCHEMA,
    schemaVersion: 1,
    projectTitle: input.projectTitle,
    generatedAt: input.generatedAt ?? Date.now(),
    summary: {
      totalShots: rows.length,
      doneShots: rows.filter((row) => row.status === "done").length,
      reworkShots: rows.filter((row) => row.status === "rework").length,
      todoShots: rows.filter((row) => row.status === "todo").length,
      issueShots: rows.filter((row) => row.qcIssues.length > 0).length,
      missingReferenceShots: rows.filter((row) => row.missingReferences.length > 0).length,
      openComments: rows.reduce((sum, row) => sum + row.openComments, 0),
      failedTasks: input.tasks.filter((task) =>
        task.status === "failed" || task.status === "canceled"
      ).length,
    },
    rows,
  }
}

export function productionLedgerCsv(ledger: ProductionLedger): string {
  const clean = (value: unknown) => String(value ?? "").replace(/\r?\n/g, " ").trim()
  const escape = (value: unknown) => `"${clean(value).replace(/"/g, '""')}"`
  const headers = [
    "集号",
    "镜号",
    "场景",
    "镜头稳定 ID",
    "状态",
    "画幅",
    "时长",
    "出场角色",
    "质检问题",
    "缺参考图",
    "未处理批注",
    "最新批注",
    "任务状态",
    "任务错误",
    "采用图",
    "采用时间",
  ]
  const lines = ledger.rows.map((row) => [
    row.episode > 0 ? row.episode : "",
    row.shot,
    row.scene,
    row.entityId,
    row.status === "done" ? "已出图" : row.status === "rework" ? "需返修" : "待出图",
    row.ratio,
    `${row.duration}s`,
    row.characters.join("、"),
    row.qcIssues.join("；"),
    row.missingReferences.join("、"),
    row.openComments,
    row.latestComment,
    row.latestTask?.status ?? "",
    row.latestTask?.error ?? "",
    row.hasSelectedAsset ? "是" : "否",
    row.selectedAssetAt ? new Date(row.selectedAssetAt).toISOString() : "",
  ].map(escape).join(","))
  return "\ufeff" + [headers.map(escape).join(","), ...lines].join("\n") + "\n"
}

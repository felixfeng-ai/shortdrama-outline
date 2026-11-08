import type { DatabaseSync } from "node:sqlite"
import { randomUUID } from "node:crypto"

import { InputError } from "../api.ts"
import { latestSnapshot } from "../assets/repo.ts"
import type { Shot, VisualCharacter, VisualPlace } from "../assets/types.ts"
import { persistEditedArtifact } from "../assets/persist.ts"
import { loadCanvasGraph, saveCanvasGraph } from "../canvas-graph-repo.ts"
import {
  createDefaultCanvasGraph,
  type CanvasGraph,
  type CanvasGraphNodeType,
} from "../canvas-graph.ts"
import { EMPTY_LOOK, readLook } from "../look.ts"
import { enqueueImageBatch } from "../generation/image-batch.ts"
import { resolveImageAspect } from "../generation/model.ts"
import { getQuota, QuotaError } from "../quota.ts"
import { getQuickCreationQuotes } from "../production/quick-creation-server.ts"
import {
  isQuickCreationTarget,
  quickCreationTargetIncludesVideo,
  quickCreationTargetIncludesVisuals,
} from "../production/quick-trial.ts"
import { upsertQuickTrialRun } from "../production/quick-trial-repo.ts"
import { applyShotRework } from "../rework/plan.ts"

export const AGENT_COMMAND_KINDS = [
  "quick-trial",
  "image-batch",
  "batch-rework",
  "canvas-action",
] as const

export type AgentCommandKind = (typeof AGENT_COMMAND_KINDS)[number]

export interface AgentCommandInput {
  projectId: string
  ownerId: string
  identity: string
  command: AgentCommandKind
  payload: Record<string, unknown>
}

export interface AgentCommandResult {
  command: AgentCommandKind
  status: "applied"
  summary: string
  data: Record<string, unknown>
}

function latestArray<T>(
  db: DatabaseSync,
  projectId: string,
  kind: "shots" | "visualCharacters" | "visualPlaces",
): T[] {
  const payload = latestSnapshot(db, projectId, kind)?.payload
  return Array.isArray(payload) ? payload as T[] : []
}

function text(value: unknown, message: string): string {
  const result = typeof value === "string" ? value.trim() : ""
  if (!result) throw new InputError(message)
  return result
}

function stringList(value: unknown, message: string): string[] {
  if (!Array.isArray(value)) throw new InputError(message)
  return Array.from(new Set(value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)))
}

function applyCanvasOperations(
  graph: CanvasGraph,
  operations: unknown[],
): CanvasGraph {
  const next: CanvasGraph = structuredClone(graph)
  for (const raw of operations) {
    if (!raw || typeof raw !== "object") throw new InputError("画布动作格式不正确")
    const operation = raw as Record<string, unknown>
    const type = text(operation.type, "画布动作缺少 type")
    if (type === "add-node") {
      const nodeType = text(operation.nodeType, "新增节点缺少类型") as CanvasGraphNodeType
      next.nodes.push({
        id: randomUUID(),
        type: nodeType,
        title: text(operation.title, "新增节点缺少标题"),
        body: typeof operation.body === "string" ? operation.body.trim() : "",
        x: Number.isFinite(Number(operation.x)) ? Number(operation.x) : 120,
        y: Number.isFinite(Number(operation.y)) ? Number(operation.y) : 120,
        system: false,
      })
      continue
    }
    if (type === "update-node") {
      const id = text(operation.id, "更新节点缺少 id")
      const node = next.nodes.find((item) => item.id === id)
      if (!node) throw new InputError("画布节点不存在")
      if (typeof operation.title === "string") node.title = operation.title.trim().slice(0, 120)
      if (typeof operation.body === "string") node.body = operation.body.trim().slice(0, 2_000)
      continue
    }
    if (type === "remove-node") {
      const id = text(operation.id, "删除节点缺少 id")
      next.nodes = next.nodes.filter((item) => item.id !== id)
      next.edges = next.edges.filter((edge) => edge.from !== id && edge.to !== id)
      continue
    }
    if (type === "connect") {
      next.edges.push({
        id: randomUUID(),
        from: text(operation.from, "连线缺少起点"),
        to: text(operation.to, "连线缺少终点"),
        label: typeof operation.label === "string" ? operation.label.trim().slice(0, 120) : "",
      })
      continue
    }
    if (type === "disconnect") {
      const id = typeof operation.id === "string" ? operation.id.trim() : ""
      const from = typeof operation.from === "string" ? operation.from.trim() : ""
      const to = typeof operation.to === "string" ? operation.to.trim() : ""
      next.edges = next.edges.filter((edge) =>
        id ? edge.id !== id : !(edge.from === from && edge.to === to)
      )
      continue
    }
    throw new InputError("不支持的画布动作")
  }
  return next
}

export async function applyAgentCommand(
  db: DatabaseSync,
  input: AgentCommandInput,
): Promise<AgentCommandResult> {
  if (input.command === "quick-trial") {
    const idea = text(input.payload.idea, "快速试片缺少故事想法")
    if (idea.length < 6) throw new InputError("故事想法太短，无法建立快速试片")
    const target = input.payload.target ?? "keyframe"
    if (!isQuickCreationTarget(target)) throw new InputError("快速创作范围无效")
    const quote = getQuickCreationQuotes()[target]
    if (!quote.available) throw new InputError(quote.unavailableReason || "当前范围不可用")
    const quota = getQuota(db, input.identity)
    if (!quota.unlimited && quota.remaining < quote.units) {
      throw new QuotaError(`本轮预计需要 ${quote.units} 额度，当前仅剩 ${quota.remaining}`)
    }
    const run = upsertQuickTrialRun(db, {
      projectId: input.projectId,
      idea,
      phase: "start",
      status: "active",
      error: null,
      target,
      budgetUnits: quote.units,
      budgetMicros: quote.totalMicros,
      visualApproved: quickCreationTargetIncludesVisuals(target),
      videoApproved: quickCreationTargetIncludesVideo(target),
      videoBudgetMicros: quote.videoCostMicros,
      videoModel: quote.video?.model ?? null,
      videoResolution: quote.video?.resolution ?? null,
      videoDurationSeconds: quote.video?.durationSeconds ?? 5,
    })
    return {
      command: input.command,
      status: "applied",
      summary: `快速试片已启动，范围 ${target}，预算 ${quote.units} 额度`,
      data: { run, quote },
    }
  }

  if (input.command === "image-batch") {
    const shotIds = stringList(input.payload.shotIds, "请选择要生成的镜头")
    if (shotIds.length === 0 || shotIds.length > 20) {
      throw new InputError("单次批量生成只允许 1-20 个镜头")
    }
    const shots = latestArray<Shot>(db, input.projectId, "shots")
    const selected = shots.filter((shot) =>
      shotIds.includes(shot.id) || shotIds.includes(shot.entityId)
    )
    if (selected.length !== shotIds.length) throw new InputError("包含不存在或无权访问的镜头")
    const targets = selected.map((shot) => ({
      key: `agent:${shot.id}`,
      name: `第 ${shot.episode} 集第 ${shot.shot} 镜`,
      targetType: "shot" as const,
      targetId: shot.entityId,
      prompt: shot.prompt || shot.action || shot.scene,
      aspect: resolveImageAspect(shot.params.ratio),
    }))
    const state = enqueueImageBatch(db, {
      projectId: input.projectId,
      identity: input.identity,
      targets,
      look: input.payload.look ? readLook(input.payload.look) : EMPTY_LOOK,
      idempotencyKey: `agent-image:${input.projectId}:${randomUUID()}`,
      concurrency: Number.isFinite(Number(input.payload.concurrency))
        ? Math.max(1, Math.min(4, Number(input.payload.concurrency)))
        : 2,
    })
    return {
      command: input.command,
      status: "applied",
      summary: `已创建 ${targets.length} 镜图像批次`,
      data: { batch: state.batch, counts: state.counts },
    }
  }

  if (input.command === "batch-rework") {
    const action = text(input.payload.action, "缺少批量返修动作")
    if (action !== "repair-anchors") throw new InputError("不支持的批量返修动作")
    const shotIds = input.payload.shotIds === undefined
      ? undefined
      : stringList(input.payload.shotIds, "shotIds 格式不正确")
    const shots = latestArray<Shot>(db, input.projectId, "shots")
    if (shots.length === 0) throw new InputError("当前项目还没有分镜")
    const result = applyShotRework({
      action,
      shots,
      visuals: latestArray<VisualCharacter>(db, input.projectId, "visualCharacters"),
      places: latestArray<VisualPlace>(db, input.projectId, "visualPlaces"),
      shotIds,
    })
    const snapshot = result.changedIds.length > 0
      ? persistEditedArtifact(db, input.projectId, "shots", result.shots)
      : null
    return {
      command: input.command,
      status: "applied",
      summary: result.changedIds.length > 0
        ? `已返修 ${result.changedIds.length} 个镜头`
        : "没有需要返修的镜头",
      data: { changedIds: result.changedIds, snapshot },
    }
  }

  const operations = Array.isArray(input.payload.operations)
    ? input.payload.operations
    : []
  if (operations.length === 0 || operations.length > 40) {
    throw new InputError("画布动作数量必须为 1-40")
  }
  const current = loadCanvasGraph(db, input.projectId)
  const expectedRevision = Number(input.payload.expectedRevision ?? current?.revision ?? 0)
  if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
    throw new InputError("expectedRevision 不合法")
  }
  const next = applyCanvasOperations(current?.graph ?? createDefaultCanvasGraph(), operations)
  const record = saveCanvasGraph(
    db,
    input.projectId,
    input.ownerId,
    next,
    expectedRevision,
  )
  return {
    command: input.command,
    status: "applied",
    summary: `已应用 ${operations.length} 个画布动作`,
    data: { revision: record.revision, graph: record.graph },
  }
}

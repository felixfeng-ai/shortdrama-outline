import { NextResponse } from "next/server"

import { InputError, errorResponse, ok } from "@/lib/api"
import { assertProjectAccess } from "@/lib/assets/access"
import { getDbForRequest } from "@/lib/assets/store"
import { resolveProjectOwner, resolveRequestIdentity } from "@/lib/auth/request"
import {
  cancelGenerationTask,
  createGenerationBatch,
  failGenerationTask,
  getGeneratedAsset,
  getGenerationBatch,
  getGenerationTask,
  listGeneratedAssets,
  listGenerationBatches,
  listGenerationTasks,
  selectGeneratedAsset,
} from "@/lib/generation/repo"
import { enforceApiRateLimit } from "@/lib/security/api-rate-limit"
import {
  estimateVideoCostMicros,
  getMiniMaxVideoConfig,
  publicVideoGenerationError,
} from "@/lib/video/model"
import {
  cancelMiniMaxVideo,
} from "@/lib/video/service"
import { createAndSubmitVideoTask, findProjectShot } from "@/lib/video/tasks"
import { reconcileProjectVideoTasks } from "@/lib/video/reconcile"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function requiredString(value: unknown, message: string): string {
  const text = typeof value === "string" ? value.trim() : ""
  if (!text) throw new InputError(message)
  return text
}

function integer(value: unknown, fallback: number): number {
  const number = typeof value === "number" ? value : Number(value)
  return Number.isFinite(number) ? Math.floor(number) : fallback
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const projectId = requiredString(url.searchParams.get("projectId"), "缺少 projectId")
    const targetId = url.searchParams.get("targetId")?.trim() || undefined
    const db = getDbForRequest()
    const ownerId = resolveProjectOwner(db, req)
    assertProjectAccess(db, projectId, ownerId)
    await reconcileProjectVideoTasks(db, projectId, ownerId)
    return NextResponse.json(ok({
      tasks: listGenerationTasks(
        db,
        projectId,
        targetId ? "shot" : undefined,
        targetId,
        "video",
      ),
      assets: listGeneratedAssets(
        db,
        projectId,
        targetId ? "shot" : undefined,
        targetId,
        "video",
      ),
      batches: listGenerationBatches(db, projectId),
    }))
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

export async function POST(req: Request) {
  const db = getDbForRequest()
  const ownerId = resolveProjectOwner(db, req)
  let taskId: string | null = null
  try {
    enforceApiRateLimit(db, req, "video", {
      identity: resolveRequestIdentity(db, req),
    })
    const body = await req.json().catch(() => null)
    const projectId = requiredString(body?.projectId, "缺少 projectId")
    const targetId = requiredString(body?.targetId, "缺少镜头 id")
    const prompt = requiredString(body?.prompt, "缺少视频提示词")
    assertProjectAccess(db, projectId, ownerId)
    const config = getMiniMaxVideoConfig()
    const model = (typeof body?.model === "string" && body.model.trim()) || config.model
    const resolution = (typeof body?.resolution === "string" && body.resolution.trim())
      || config.defaultResolution
    const shot = findProjectShot(db, projectId, targetId)
    if (!shot) throw new InputError("当前镜头还没有保存到项目")

    const mode = body?.mode === "text-to-video" ? "text-to-video" : "image-to-video"
    const sourceAssetId = typeof body?.sourceAssetId === "string"
      ? body.sourceAssetId.trim()
      : ""
    const duration = integer(body?.duration, 5)
    const ratio = typeof body?.ratio === "string" ? body.ratio : "9:16"
    const estimatedCostMicros = estimateVideoCostMicros({ model, resolution, duration })
    const maxBudgetMicros = integer(body?.maxBudgetMicros, estimatedCostMicros)
    if (maxBudgetMicros < estimatedCostMicros) {
      throw new InputError(
        `预计费用 ${(estimatedCostMicros / 1_000_000).toFixed(2)} 元，超过本次预算`,
      )
    }

    const idempotencyKey = typeof body?.idempotencyKey === "string"
      ? body.idempotencyKey.trim().slice(0, 200)
      : null
    const batch = createGenerationBatch(db, {
      projectId,
      episode: integer(shot.episode, 0),
      scope: { shotIds: [targetId] },
      budgetLimitMicros: maxBudgetMicros,
      status: "confirmed",
      idempotencyKey: idempotencyKey ? `batch:${idempotencyKey}` : null,
    })
    const autoSelect = body?.autoSelect === true
    const result = await createAndSubmitVideoTask(db, {
      projectId,
      targetId,
      sourceAssetId: sourceAssetId || null,
      prompt,
      mode,
      model,
      resolution,
      duration,
      ratio,
      batchId: batch.id,
      maxBudgetMicros,
      idempotencyKey,
      autoSelect,
      signal: req.signal,
    })
    taskId = result.task.id
    return NextResponse.json(ok({
      task: result.task,
      asset: null,
      batch: getGenerationBatch(db, batch.id),
      reused: result.reused,
    }))
  } catch (error) {
    if (taskId) {
      const task = getGenerationTask(db, taskId)
      if (task?.status === "queued") {
        failGenerationTask(
          db,
          taskId,
          error instanceof Error ? error.message : "视频任务创建失败",
        )
      }
    }
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json().catch(() => null)
    const projectId = requiredString(body?.projectId, "缺少 projectId")
    const db = getDbForRequest()
    assertProjectAccess(db, projectId, resolveProjectOwner(db, req))
    const action = body?.action === "cancel" || body?.action === "retry"
      ? body.action
      : "select"
    if (action === "select") {
      const assetId = requiredString(body?.assetId, "缺少 assetId")
      const asset = getGeneratedAsset(db, assetId, projectId)
      if (!asset || asset.mediaKind !== "video") throw new InputError("视频候选不存在")
      return NextResponse.json(ok({ asset: selectGeneratedAsset(db, projectId, assetId) }))
    }
    const taskId = requiredString(body?.taskId, "缺少 taskId")
    const task = getGenerationTask(db, taskId)
    if (!task || task.projectId !== projectId || task.mediaKind !== "video") {
      throw new InputError("视频任务不存在")
    }
    if (action === "retry") {
      if (task.status !== "failed" && task.status !== "canceled") {
        throw new InputError("只有失败或已取消的视频任务可以重试")
      }
      const request = task.request ?? {}
      const mode = request.mode === "text-to-video" ? "text-to-video" : "image-to-video"
      const resolution = typeof request.resolution === "string"
        ? request.resolution
        : "768P"
      const duration = integer(request.duration, 5)
      const ratio = typeof request.ratio === "string" ? request.ratio : "9:16"
      const sourceAssetId = typeof request.sourceAssetId === "string"
        ? request.sourceAssetId
        : null
      const maxBudgetMicros = Math.max(
        task.estimatedCostMicros ?? 0,
        estimateVideoCostMicros({ model: task.model, resolution, duration }),
      )
      const retried = await createAndSubmitVideoTask(db, {
        projectId,
        targetId: task.targetId,
        sourceAssetId,
        prompt: task.prompt,
        mode,
        model: task.model,
        resolution,
        duration,
        ratio,
        batchId: task.batchId ?? null,
        maxBudgetMicros,
        idempotencyKey: `retry:${task.id}`,
        retryOfTaskId: task.id,
        requireSelectedFrame: false,
        autoSelect: request.autoSelect === true,
      })
      return NextResponse.json(ok({ task: retried.task, reused: retried.reused }))
    }
    if (task.status !== "queued" && task.status !== "running") {
      return NextResponse.json(ok({ task }))
    }
    if (task.providerTaskId) {
      const canceled = await cancelMiniMaxVideo(task.providerTaskId)
      if (!canceled) throw new InputError("视频已开始生成，供应商不允许取消")
    }
    return NextResponse.json(ok({
      task: cancelGenerationTask(db, task.id, "用户已取消视频生成"),
    }))
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

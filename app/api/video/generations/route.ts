import { NextResponse } from "next/server"

import { InputError, errorResponse, ok } from "@/lib/api"
import { assertProjectAccess } from "@/lib/assets/access"
import { getDbForRequest } from "@/lib/assets/store"
import { resolveProjectOwner, resolveRequestIdentity } from "@/lib/auth/request"
import { writeGeneratedVideo } from "@/lib/generation/files"
import {
  cancelGenerationTask,
  completeGenerationTask,
  createGenerationBatch,
  failGenerationTask,
  getGeneratedAsset,
  getGenerationBatch,
  getGenerationTask,
  listGeneratedAssets,
  listGenerationBatches,
  listGenerationTasks,
  markGenerationTaskRunning,
  saveGeneratedAsset,
  selectGeneratedAsset,
  updateGenerationProviderStatus,
} from "@/lib/generation/repo"
import { enforceApiRateLimit } from "@/lib/security/api-rate-limit"
import { notifyGenerationFinished } from "@/lib/push/service"
import {
  estimateVideoCostMicros,
  getMiniMaxVideoConfig,
  publicVideoGenerationError,
} from "@/lib/video/model"
import {
  cancelMiniMaxVideo,
  downloadMiniMaxVideo,
  queryMiniMaxVideo,
} from "@/lib/video/service"
import { createAndSubmitVideoTask, findProjectShot } from "@/lib/video/tasks"

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

async function reconcileVideoTasks(
  db: ReturnType<typeof getDbForRequest>,
  projectId: string,
  ownerId: string,
): Promise<void> {
  const now = Date.now()
  const tasks = listGenerationTasks(db, projectId, undefined, undefined, "video")
    .filter((task) =>
      (task.status === "queued" || task.status === "running")
      && Boolean(task.providerTaskId)
      && (task.nextPollAt ?? 0) <= now
    )
    .slice(0, 6)

  for (const task of tasks) {
    try {
      const state = await queryMiniMaxVideo(task.providerTaskId!)
      if (state.status === "queued" || state.status === "running") {
        if (state.status === "running") markGenerationTaskRunning(db, task.id)
        updateGenerationProviderStatus(db, task.id, {
          providerStatus: state.status,
          nextPollAt: Date.now() + 5_000,
        })
        continue
      }
      if (state.status === "canceled") {
        updateGenerationProviderStatus(db, task.id, {
          providerStatus: state.status,
          nextPollAt: Date.now() + 60_000,
        })
        cancelGenerationTask(db, task.id, "供应商已取消")
        continue
      }
      if (state.status === "failed") {
        updateGenerationProviderStatus(db, task.id, {
          providerStatus: state.status,
          nextPollAt: Date.now() + 60_000,
        })
        const failed = failGenerationTask(
          db,
          task.id,
          publicVideoGenerationError(state.error),
        )
        await notifyGenerationFinished(db, ownerId, {
          taskId: task.id,
          targetType: task.targetType,
          status: "failed",
          mediaKind: "video",
          error: failed.error,
          projectId: task.projectId,
          targetId: task.targetId,
          assetId: null,
        }).catch(() => undefined)
        continue
      }
      if (state.status !== "succeeded") continue

      const video = await downloadMiniMaxVideo(state.videoUrl)
      const file = writeGeneratedVideo(
        projectId,
        `${task.id}-video`,
        video.bytes,
        video.mime,
      )
      const request = task.request ?? {}
      const sourceAssetId = typeof request.sourceAssetId === "string"
        ? request.sourceAssetId
        : null
      const requestedDuration = integer(request.duration, 0)
      const durationMs = state.durationSeconds !== null
        ? Math.round(state.durationSeconds * 1000)
        : requestedDuration > 0
          ? requestedDuration * 1000
          : null
      const asset = saveGeneratedAsset(db, {
        taskId: task.id,
        projectId,
        targetType: task.targetType,
        targetId: task.targetId,
        storageKey: file.storageKey,
        mime: video.mime,
        bytes: file.bytes,
        providerId: task.providerId,
        model: task.model,
        prompt: task.prompt,
        mediaKind: "video",
        durationMs,
        width: null,
        height: null,
        fps: null,
        sha256: video.sha256,
        posterStorageKey: null,
        sourceAssetIds: sourceAssetId ? [sourceAssetId] : [],
        generationMeta: {
          providerTaskId: task.providerTaskId,
          providerStatus: state.status,
          resolution: state.resolution,
          ratio: state.ratio,
          usage: state.usage,
        },
      })
      if (request.autoSelect === true) selectGeneratedAsset(db, projectId, asset.id)
      updateGenerationProviderStatus(db, task.id, {
        providerStatus: state.status,
        nextPollAt: Date.now() + 60_000,
      })
      const completed = completeGenerationTask(db, task.id, asset.id)
      await notifyGenerationFinished(db, ownerId, {
        taskId: task.id,
        targetType: task.targetType,
        status: "succeeded",
        mediaKind: "video",
        projectId: task.projectId,
        targetId: task.targetId,
        assetId: completed.assetId,
      }).catch(() => undefined)
    } catch (error) {
      updateGenerationProviderStatus(db, task.id, {
        providerStatus: "query_error",
        nextPollAt: Date.now() + 15_000,
      })
      console.warn("[video] 任务对账失败", {
        taskId: task.id,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const projectId = requiredString(url.searchParams.get("projectId"), "缺少 projectId")
    const targetId = url.searchParams.get("targetId")?.trim() || undefined
    const db = getDbForRequest()
    const ownerId = resolveProjectOwner(db, req)
    assertProjectAccess(db, projectId, ownerId)
    await reconcileVideoTasks(db, projectId, ownerId)
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

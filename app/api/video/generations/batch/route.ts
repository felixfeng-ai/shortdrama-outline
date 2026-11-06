import { NextResponse } from "next/server"

import { InputError, errorResponse, ok } from "@/lib/api"
import { assertProjectAccess } from "@/lib/assets/access"
import { getDbForRequest } from "@/lib/assets/store"
import { resolveProjectOwner, resolveRequestIdentity } from "@/lib/auth/request"
import { createGenerationBatch, getGenerationBatch } from "@/lib/generation/repo"
import type { GenerationTask } from "@/lib/generation/types"
import { enforceApiRateLimit } from "@/lib/security/api-rate-limit"
import { releaseQuota, reserveQuota } from "@/lib/quota"
import { quotaUnitsForCostMicros } from "@/lib/model-pricing"
import {
  estimateVideoCostMicros,
  getMiniMaxVideoConfig,
} from "@/lib/video/model"
import {
  createAndSubmitVideoTask,
  findProjectShot,
  findSelectedFrame,
} from "@/lib/video/tasks"

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

export async function POST(req: Request) {
  try {
    const db = getDbForRequest()
    const ownerId = resolveProjectOwner(db, req)
    const identity = resolveRequestIdentity(db, req)
    enforceApiRateLimit(db, req, "video", {
      identity,
    })
    const body = await req.json().catch(() => null)
    const projectId = requiredString(body?.projectId, "缺少 projectId")
    assertProjectAccess(db, projectId, ownerId)
    if (!Array.isArray(body?.shots) || body.shots.length === 0) {
      throw new InputError("缺少批量镜头")
    }
    if (body.shots.length > 30) throw new InputError("单批次最多 30 个镜头")
    const config = getMiniMaxVideoConfig()
    const model = (typeof body?.model === "string" && body.model.trim()) || config.model
    const resolution = (typeof body?.resolution === "string" && body.resolution.trim())
      || config.defaultResolution

    const ready: Array<{
      targetId: string
      sourceAssetId: string
      prompt: string
      duration: number
      ratio: string
      estimatedCostMicros: number
    }> = []
    const blocked: Array<{ targetId: string; reason: string }> = []

    for (const raw of body.shots) {
      const targetId = typeof raw?.targetId === "string" ? raw.targetId.trim() : ""
      if (!targetId) {
        blocked.push({ targetId: "", reason: "缺少镜头 id" })
        continue
      }
      try {
        if (!findProjectShot(db, projectId, targetId)) {
          throw new InputError("镜头还没有保存到项目")
        }
        const sourceAssetId = requiredString(raw?.sourceAssetId, "缺少已采用首帧")
        findSelectedFrame(db, projectId, targetId, sourceAssetId)
        const prompt = requiredString(raw?.prompt, "缺少视频提示词")
        const duration = integer(raw?.duration, 5)
        const ratio = typeof raw?.ratio === "string" ? raw.ratio : "9:16"
        const estimatedCostMicros = estimateVideoCostMicros({
          model,
          resolution,
          duration,
        })
        ready.push({
          targetId,
          sourceAssetId,
          prompt,
          duration,
          ratio,
          estimatedCostMicros,
        })
      } catch (error) {
        blocked.push({
          targetId,
          reason: error instanceof Error ? error.message : "镜头准备未完成",
        })
      }
    }

    if (ready.length === 0) {
      return NextResponse.json(ok({
        batch: null,
        tasks: [],
        blocked,
      }))
    }
    const estimatedTotal = ready.reduce((sum, item) => sum + item.estimatedCostMicros, 0)
    const budgetLimitMicros = integer(body?.budgetLimitMicros, estimatedTotal)
    if (budgetLimitMicros < estimatedTotal) {
      throw new InputError(
        `整批预计费用 ${(estimatedTotal / 1_000_000).toFixed(2)} 元，超过本次预算`,
      )
    }
    const idempotencyKey = typeof body?.idempotencyKey === "string"
      ? body.idempotencyKey.trim().slice(0, 200)
      : null
    const batch = createGenerationBatch(db, {
      projectId,
      episode: integer(findProjectShot(db, projectId, ready[0].targetId)?.episode, 0),
      scope: { shotIds: ready.map((item) => item.targetId) },
      budgetLimitMicros,
      status: "confirmed",
      idempotencyKey: idempotencyKey ? `batch:${idempotencyKey}` : null,
    })

    const outcomes: Array<{
      task?: GenerationTask
      failure?: { targetId: string; reason: string }
    }> = new Array(ready.length)
    let cursor = 0
    const workers = Math.min(2, ready.length)
    async function submitWorker() {
      while (true) {
        const index = cursor
        cursor += 1
        if (index >= ready.length) return
        const item = ready[index]
        const itemKey = idempotencyKey ? `${idempotencyKey}:${item.targetId}` : null
        const quotaUnits = quotaUnitsForCostMicros(item.estimatedCostMicros)
        const hold = reserveQuota(db, identity, "video", {
          requestId: itemKey ? `video:${itemKey}` : undefined,
          units: quotaUnits,
          ttlMs: 24 * 60 * 60_000,
        })
        try {
          const result = await createAndSubmitVideoTask(db, {
            projectId,
            targetId: item.targetId,
            sourceAssetId: item.sourceAssetId,
            prompt: item.prompt,
            mode: "image-to-video",
            model,
            resolution,
            duration: item.duration,
            ratio: item.ratio,
            batchId: batch.id,
            maxBudgetMicros: item.estimatedCostMicros,
            idempotencyKey: itemKey,
            autoSelect: false,
            quotaReservationId: hold.id,
            quotaUnits,
            signal: req.signal,
          })
          if (result.reused && result.task.quotaReservationId !== hold.id) {
            releaseQuota(db, hold.id, "video_batch_task_reused")
          }
          if (result.task.status === "failed" || result.task.status === "canceled") {
            outcomes[index] = {
              failure: {
                targetId: item.targetId,
                reason: result.task.error || "视频任务提交失败",
              },
            }
          } else {
            outcomes[index] = { task: result.task }
          }
        } catch (error) {
          releaseQuota(db, hold.id, error instanceof Error ? error.message : "video_batch_failed")
          outcomes[index] = {
            failure: {
              targetId: item.targetId,
              reason: error instanceof Error ? error.message : "视频任务提交失败",
            },
          }
        }
      }
    }
    await Promise.all(Array.from({ length: workers }, () => submitWorker()))
    const tasks = outcomes.flatMap((outcome) => outcome.task ? [outcome.task] : [])
    const failures = outcomes.flatMap((outcome) => outcome.failure ? [outcome.failure] : [])

    return NextResponse.json(ok({
      batch: getGenerationBatch(db, batch.id),
      tasks,
      blocked,
      failures,
    }))
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

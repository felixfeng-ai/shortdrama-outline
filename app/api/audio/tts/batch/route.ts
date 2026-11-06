import { NextResponse } from "next/server"

import { InputError, errorResponse, ok } from "@/lib/api"
import { assertProjectAccess } from "@/lib/assets/access"
import { latestSnapshot } from "@/lib/assets/repo"
import { getDbForRequest } from "@/lib/assets/store"
import {
  createAndSynthesizeShotTts,
  prepareShotTts,
} from "@/lib/audio/tts-tasks"
import { resolveProjectOwner, resolveRequestIdentity } from "@/lib/auth/request"
import {
  createGenerationBatch,
  getGenerationBatch,
} from "@/lib/generation/repo"
import type { GeneratedAsset, GenerationTask } from "@/lib/generation/types"
import { enforceApiRateLimit } from "@/lib/security/api-rate-limit"
import { withQuotaReservation } from "@/lib/quota"
import { quotaUnitsForCostMicros } from "@/lib/model-pricing"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function requiredString(value: unknown, message: string): string {
  const text = typeof value === "string" ? value.trim() : ""
  if (!text) throw new InputError(message)
  return text
}

function integer(value: unknown, message: string): number {
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number < 0) throw new InputError(message)
  return number
}

export async function POST(req: Request) {
  try {
    const db = getDbForRequest()
    const ownerId = resolveProjectOwner(db, req)
    enforceApiRateLimit(db, req, "audio", {
      identity: resolveRequestIdentity(db, req),
    })
    const body = await req.json().catch(() => null)
    const projectId = requiredString(body?.projectId, "缺少 projectId")
    const episode = integer(body?.episode, "缺少集号")
    assertProjectAccess(db, projectId, ownerId)
    const snapshot = latestSnapshot(db, projectId, "shots")
    if (!snapshot || !Array.isArray(snapshot.payload)) {
      throw new InputError("还没有分镜，不能批量生成对白")
    }
    const shotIds = snapshot.payload
      .filter((item) => item && typeof item === "object" && !Array.isArray(item))
      .filter((item) => Math.max(0, Math.floor(Number((item as Record<string, unknown>).episode))) === episode)
      .map((item) => {
        const record = item as Record<string, unknown>
        return typeof record.entityId === "string"
          ? record.entityId
          : typeof record.id === "string"
            ? record.id
            : ""
      })
      .filter(Boolean)
    if (shotIds.length > 50) throw new InputError("单个语音批次不能超过 50 句")

    const ready: Array<{
      shotId: string
      estimatedCostMicros: number
    }> = []
    const blocked: Array<{ targetId: string; reason: string }> = []
    // 先完成整批预检，避免部分镜头已经扣费后才发现预算不足或音色缺失。
    for (const shotId of shotIds) {
      try {
        const prepared = prepareShotTts(db, projectId, shotId)
        ready.push({
          shotId,
          estimatedCostMicros: prepared.estimatedCostMicros,
        })
      } catch (error) {
        blocked.push({
          targetId: shotId,
          reason: error instanceof Error ? error.message : "对白准备未完成",
        })
      }
    }
    if (ready.length === 0) {
      return NextResponse.json(ok({
        batch: null,
        tasks: [],
        assets: [],
        blocked,
        failures: [],
      }))
    }
    const estimatedTotal = ready.reduce((sum, item) => sum + item.estimatedCostMicros, 0)
    const maxBudgetMicros = integer(body?.maxBudgetMicros, "缺少本次最大预算")
    if (maxBudgetMicros < estimatedTotal) {
      throw new InputError(
        `整批预计费用 ${(estimatedTotal / 1_000_000).toFixed(2)} 元，超过本次预算`,
      )
    }
    const idempotencyKey = typeof body?.idempotencyKey === "string"
      ? body.idempotencyKey.trim().slice(0, 160)
      : null
    const batch = createGenerationBatch(db, {
      projectId,
      episode,
      scope: { shotIds: ready.map((item) => item.shotId), mediaKind: "audio" },
      budgetLimitMicros: maxBudgetMicros,
      status: "confirmed",
      idempotencyKey: idempotencyKey ? `batch:${idempotencyKey}` : null,
    })

    const outcomes: Array<{
      task?: GenerationTask
      asset?: GeneratedAsset | null
      quotaUnits?: number
      failure?: { targetId: string; reason: string }
    }> = new Array(ready.length)
    let cursor = 0
    // 固定最多两路并发，既缩短等待时间，也避免瞬间打满供应商限流。
    async function worker() {
      while (true) {
        const index = cursor
        cursor += 1
        if (index >= ready.length) return
        const item = ready[index]
        try {
          const itemKey = idempotencyKey
            ? `batch:${idempotencyKey}:${item.shotId}`
            : null
          const quotaUnits = quotaUnitsForCostMicros(item.estimatedCostMicros)
          const { value: result } = await withQuotaReservation(
            db,
            resolveRequestIdentity(db, req),
            "audio",
            quotaUnits,
            () => createAndSynthesizeShotTts(db, {
              projectId,
              shotId: item.shotId,
              maxBudgetMicros: item.estimatedCostMicros,
              batchId: batch.id,
              idempotencyKey: itemKey,
            }),
            { requestId: itemKey ? `tts:${itemKey}` : undefined },
          )
          outcomes[index] = { task: result.task, asset: result.asset, quotaUnits }
        } catch (error) {
          outcomes[index] = {
            failure: {
              targetId: item.shotId,
              reason: error instanceof Error ? error.message : "对白生成失败",
            },
          }
        }
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(2, ready.length) }, () => worker()),
    )
    return NextResponse.json(ok({
      batch: getGenerationBatch(db, batch.id),
      tasks: outcomes.flatMap((outcome) => outcome.task ? [outcome.task] : []),
      assets: outcomes.flatMap((outcome) => outcome.asset ? [outcome.asset] : []),
      blocked,
      failures: outcomes.flatMap((outcome) => outcome.failure ? [outcome.failure] : []),
    }))
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

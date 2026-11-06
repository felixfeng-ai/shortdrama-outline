import { NextResponse } from "next/server"

import { InputError, errorResponse, ok } from "@/lib/api"
import { assertProjectAccess } from "@/lib/assets/access"
import { getDbForRequest } from "@/lib/assets/store"
import { createAndSynthesizeShotTts, prepareShotTts } from "@/lib/audio/tts-tasks"
import {
  listGeneratedAssets,
  listGenerationBatches,
  listGenerationTasks,
} from "@/lib/generation/repo"
import { resolveProjectOwner, resolveRequestIdentity } from "@/lib/auth/request"
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

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const projectId = requiredString(url.searchParams.get("projectId"), "缺少 projectId")
    const db = getDbForRequest()
    assertProjectAccess(db, projectId, resolveProjectOwner(db, req))
    return NextResponse.json(ok({
      tasks: listGenerationTasks(db, projectId, undefined, undefined, "audio"),
      assets: listGeneratedAssets(db, projectId, undefined, undefined, "audio"),
      batches: listGenerationBatches(db, projectId)
        .filter((batch) => {
          const scope = batch.scope
          return scope.mediaKind === "audio"
        }),
    }), { headers: { "cache-control": "no-store" } })
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
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
    const shotId = requiredString(body?.shotId, "缺少镜头 id")
    const maxBudgetMicros = integer(body?.maxBudgetMicros, "缺少本次最大预算")
    assertProjectAccess(db, projectId, ownerId)
    const prepared = prepareShotTts(db, projectId, shotId)
    const quotaUnits = quotaUnitsForCostMicros(prepared.estimatedCostMicros)
    const idempotencyKey = typeof body?.idempotencyKey === "string"
      ? body.idempotencyKey
      : null
    const { value } = await withQuotaReservation(
      db,
      resolveRequestIdentity(db, req),
      "audio",
      quotaUnits,
      () => createAndSynthesizeShotTts(db, {
        projectId,
        shotId,
        maxBudgetMicros,
        idempotencyKey,
        signal: req.signal,
      }),
      { requestId: idempotencyKey ? `tts:${idempotencyKey}` : undefined },
    )
    return NextResponse.json(ok({ ...value, quotaUnits }))
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

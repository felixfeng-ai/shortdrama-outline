import { after, NextResponse } from "next/server"

import { errorResponse, ok } from "@/lib/api"
import { assertProjectAccess } from "@/lib/assets/access"
import { getDbForRequest } from "@/lib/assets/store"
import { resolveProjectOwner, resolveRequestIdentity } from "@/lib/auth/request"
import { assertNovelAccess } from "@/lib/novels/access"
import { runNovelGenerationTick } from "@/lib/novels/generator"
import { estimateNovelGeneration, requireNovelPreset } from "@/lib/novels/presets"
import { enqueueNovelRun } from "@/lib/novels/repo"
import { releaseQuota, reserveQuota, settleQuota } from "@/lib/quota"
import { enforceApiRateLimit } from "@/lib/security/api-rate-limit"

export const runtime = "nodejs"
export const maxDuration = 600

type RouteContext = {
  params: { id: string; novelId: string } | Promise<{ id: string; novelId: string }>
}

export async function POST(req: Request, context: RouteContext) {
  let quotaReservationId: string | null = null
  try {
    const body = await req.json().catch(() => null)
    const db = getDbForRequest()
    const ownerId = resolveProjectOwner(db, req)
    const identity = resolveRequestIdentity(db, req)
    const { id, novelId } = await context.params
    assertProjectAccess(db, id, ownerId)
    const edition = assertNovelAccess(db, id, novelId, ownerId)
    if (body?.confirmed !== true) {
      return NextResponse.json(
        { success: false, data: null, error: "请先确认篇幅、章节数、额度和预计耗时" },
        { status: 400 },
      )
    }
    const preset = requireNovelPreset(body?.preset ?? edition.preset)
    const estimate = estimateNovelGeneration(preset, edition.plannedChapters)
    enforceApiRateLimit(db, req, "novel", { identity })
    const quotaUnits = Math.min(estimate.quotaUnits, 18)
    const idempotencyKey = String(
      body?.idempotencyKey || `novel:${edition.sourceSignature}:${preset.id}:v1`,
    )
    const hold = reserveQuota(db, identity, "novel", {
      requestId: `novel-quota:${idempotencyKey}`,
      units: quotaUnits,
      ttlMs: 24 * 60 * 60_000,
    })
    quotaReservationId = hold.id
    const run = enqueueNovelRun(
      db,
      novelId,
      idempotencyKey,
      estimate.quotaUnits,
      Date.now(),
      { reservationId: hold.id, units: quotaUnits },
    )
    after(async () => {
      const tick = await runNovelGenerationTick(db, run.id)
      if (tick.state === "complete") settleQuota(db, hold.id, quotaUnits)
      if (tick.state === "failed") releaseQuota(db, hold.id, tick.run.error ?? "novel_failed")
    })
    return NextResponse.json(ok({ run, estimate }), {
      headers: { "cache-control": "no-store" },
    })
  } catch (error) {
    if (quotaReservationId) {
      releaseQuota(getDbForRequest(), quotaReservationId, "novel_enqueue_failed")
    }
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

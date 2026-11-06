import { after, NextResponse } from "next/server"

import { errorResponse, ok } from "@/lib/api"
import { assertProjectAccess } from "@/lib/assets/access"
import { getDbForRequest } from "@/lib/assets/store"
import { resolveProjectOwner, resolveRequestIdentity } from "@/lib/auth/request"
import { assertNovelAccess } from "@/lib/novels/access"
import { runNovelGenerationTick } from "@/lib/novels/generator"
import { estimateNovelGeneration, requireNovelPreset } from "@/lib/novels/presets"
import { enqueueNovelRun } from "@/lib/novels/repo"
import { chargeQuota } from "@/lib/quota"
import { enforceApiRateLimit } from "@/lib/security/api-rate-limit"

export const runtime = "nodejs"
export const maxDuration = 600

type RouteContext = {
  params: { id: string; novelId: string } | Promise<{ id: string; novelId: string }>
}

export async function POST(req: Request, context: RouteContext) {
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
    chargeQuota(db, identity, "novel", Date.now(), Math.min(estimate.quotaUnits, 18))
    const run = enqueueNovelRun(
      db,
      novelId,
      String(body?.idempotencyKey || `novel:${edition.sourceSignature}:${preset.id}:v1`),
      estimate.quotaUnits,
    )
    after(async () => {
      await runNovelGenerationTick(db, run.id)
    })
    return NextResponse.json(ok({ run, estimate }), {
      headers: { "cache-control": "no-store" },
    })
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

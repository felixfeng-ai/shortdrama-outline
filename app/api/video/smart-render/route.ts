import { NextResponse } from "next/server"

import { InputError, errorResponse, ok } from "@/lib/api"
import { assertProjectAccess } from "@/lib/assets/access"
import { getDbForRequest } from "@/lib/assets/store"
import { resolveProjectOwner, resolveRequestIdentity } from "@/lib/auth/request"
import { RENDER_UNITS } from "@/lib/model-pricing"
import { releaseQuota, reserveQuota } from "@/lib/quota"
import { enforceApiRateLimit } from "@/lib/security/api-rate-limit"
import { toVideoRenderDto } from "@/lib/video/render-dto"
import { scheduleVideoRenderQueue } from "@/lib/video/render-queue"
import { enqueueEpisodeRender } from "@/lib/video/render-service"
import type {
  RenderExportPreset,
  RenderQualityProfile,
} from "@/lib/video/render-types"
import { prepareSmartEpisodeFilm } from "@/lib/video/smart-film"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function requiredString(value: unknown, message: string): string {
  const text = typeof value === "string" ? value.trim() : ""
  if (!text) throw new InputError(message)
  return text
}

function integer(value: unknown, message: string): number {
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number < 0 || number > 9999) {
    throw new InputError(message)
  }
  return number
}

export async function POST(req: Request) {
  let quotaHoldId: string | null = null
  try {
    const db = getDbForRequest()
    const ownerId = resolveProjectOwner(db, req)
    const identity = resolveRequestIdentity(db, req)
    enforceApiRateLimit(db, req, "export", { identity })
    const body = await req.json().catch(() => null)
    const projectId = requiredString(body?.projectId, "缺少 projectId")
    const episode = integer(body?.episode, "缺少集号")
    const qualityProfile: RenderQualityProfile =
      body?.qualityProfile === "delivery" ? "delivery" : "preview"
    const exportPreset: RenderExportPreset =
      body?.exportPreset === "landscape" || body?.exportPreset === "square"
        ? body.exportPreset
        : "vertical"
    assertProjectAccess(db, projectId, ownerId)

    const prepared = await prepareSmartEpisodeFilm(db, {
      projectId,
      episode,
      identity,
      signal: req.signal,
    })
    const hold = reserveQuota(db, identity, "render", {
      units: RENDER_UNITS,
      ttlMs: 24 * 60 * 60_000,
    })
    quotaHoldId = hold.id
    const render = enqueueEpisodeRender(db, {
      projectId,
      episode,
      timelineVersionId: prepared.version.id,
      qualityProfile,
      exportPreset,
      quotaReservationId: hold.id,
      quotaUnits: RENDER_UNITS,
    })
    if (render.quotaReservationId !== hold.id) {
      releaseQuota(db, hold.id, "smart_render_reused")
      quotaHoldId = null
    }
    scheduleVideoRenderQueue(db)
    return NextResponse.json(ok({
      render: toVideoRenderDto(render),
      version: prepared.version,
      qualityProfile,
      exportPreset,
      adoptedVideoCount: prepared.adoptedVideoCount,
      generatedTtsCount: prepared.generatedTtsCount,
      warnings: prepared.warnings,
      bgmTrackId: prepared.bgmTrackId,
      quotaUnits: RENDER_UNITS,
    }), {
      status: 202,
      headers: { "cache-control": "no-store" },
    })
  } catch (error) {
    if (quotaHoldId) {
      releaseQuota(
        getDbForRequest(),
        quotaHoldId,
        error instanceof Error ? error.message : "smart_render_failed",
      )
    }
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

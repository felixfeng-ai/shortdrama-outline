import { NextResponse } from "next/server"

import { InputError, errorResponse, ok } from "@/lib/api"
import { assertProjectAccess } from "@/lib/assets/access"
import { getDbForRequest } from "@/lib/assets/store"
import { resolveProjectOwner, resolveRequestIdentity } from "@/lib/auth/request"
import { enforceApiRateLimit } from "@/lib/security/api-rate-limit"
import { toVideoRenderDto } from "@/lib/video/render-dto"
import { scheduleVideoRenderQueue } from "@/lib/video/render-queue"
import { enqueueFrozenEpisodeQueue } from "@/lib/video/render-service"
import { listLatestTimelineVersions } from "@/lib/timeline/repo"
import { releaseQuota, reserveQuota } from "@/lib/quota"
import { RENDER_UNITS } from "@/lib/model-pricing"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  const quotaHolds: Array<{ reservationId: string; versionId: string }> = []
  try {
    const db = getDbForRequest()
    const ownerId = resolveProjectOwner(db, req)
    const identity = resolveRequestIdentity(db, req)
    enforceApiRateLimit(db, req, "export", {
      identity,
    })
    const body = await req.json().catch(() => null)
    const projectId = typeof body?.projectId === "string" ? body.projectId.trim() : ""
    if (!projectId) throw new InputError("缺少 projectId")
    if (!Array.isArray(body?.episodes) || body.episodes.length === 0) {
      throw new InputError("至少选择一集")
    }
    const rawEpisodes: unknown[] = body.episodes
    const episodes: number[] = [
      ...new Set(rawEpisodes.map((value: unknown) => Number(value))),
    ]
    if (
      episodes.length > 100
      || episodes.some((episode) => !Number.isSafeInteger(episode) || episode < 0 || episode > 9999)
    ) {
      throw new InputError("集号不正确或一次排队超过 100 集")
    }
    assertProjectAccess(db, projectId, ownerId)
    const requested = new Set(episodes)
    const versions = listLatestTimelineVersions(db, projectId)
      .filter((version) => requested.has(version.episode))
    const quotaReservations: Record<string, { reservationId: string; units: number }> = {}
    for (const version of versions) {
      const hold = reserveQuota(db, identity, "render", {
        requestId: `render:${projectId}:${version.id}:${version.revision}`,
        units: RENDER_UNITS,
        ttlMs: 24 * 60 * 60_000,
      })
      quotaHolds.push({ reservationId: hold.id, versionId: version.id })
      quotaReservations[version.id] = { reservationId: hold.id, units: RENDER_UNITS }
    }
    const result = enqueueFrozenEpisodeQueue(db, {
      projectId,
      episodes,
      quotaReservations,
    })
    const usedReservations = new Set(
      result.renders
        .map((render) => render.quotaReservationId)
        .filter((id): id is string => Boolean(id)),
    )
    for (const hold of quotaHolds) {
      if (!usedReservations.has(hold.reservationId)) {
        releaseQuota(db, hold.reservationId, "render_batch_blocked")
      }
    }
    scheduleVideoRenderQueue(db)
    return NextResponse.json(ok({
      renders: result.renders.map(toVideoRenderDto),
      blocked: result.blocked,
    }), { status: 202, headers: { "cache-control": "no-store" } })
  } catch (error) {
    for (const hold of quotaHolds) {
      releaseQuota(
        getDbForRequest(),
        hold.reservationId,
        error instanceof Error ? error.message : "render_batch_failed",
      )
    }
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

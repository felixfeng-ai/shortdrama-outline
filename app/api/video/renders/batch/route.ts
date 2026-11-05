import { NextResponse } from "next/server"

import { InputError, errorResponse, ok } from "@/lib/api"
import { assertProjectAccess } from "@/lib/assets/access"
import { getDbForRequest } from "@/lib/assets/store"
import { resolveProjectOwner, resolveRequestIdentity } from "@/lib/auth/request"
import { enforceApiRateLimit } from "@/lib/security/api-rate-limit"
import { toVideoRenderDto } from "@/lib/video/render-dto"
import { scheduleVideoRenderQueue } from "@/lib/video/render-queue"
import { enqueueFrozenEpisodeQueue } from "@/lib/video/render-service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  try {
    const db = getDbForRequest()
    const ownerId = resolveProjectOwner(db, req)
    enforceApiRateLimit(db, req, "export", {
      identity: resolveRequestIdentity(db, req),
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
    const result = enqueueFrozenEpisodeQueue(db, { projectId, episodes })
    scheduleVideoRenderQueue(db)
    return NextResponse.json(ok({
      renders: result.renders.map(toVideoRenderDto),
      blocked: result.blocked,
    }), { status: 202, headers: { "cache-control": "no-store" } })
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

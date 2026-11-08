import { NextResponse } from "next/server"

import { InputError, errorResponse, ok } from "@/lib/api"
import { assertProjectAccess } from "@/lib/assets/access"
import { getDbForRequest } from "@/lib/assets/store"
import { resolveProjectOwner, resolveRequestIdentity } from "@/lib/auth/request"
import { enforceApiRateLimit } from "@/lib/security/api-rate-limit"
import { toVideoRenderDto } from "@/lib/video/render-dto"
import { scheduleVideoRenderQueue } from "@/lib/video/render-queue"
import { listVideoRenders } from "@/lib/video/render-repo"
import { enqueueEpisodeRender } from "@/lib/video/render-service"
import { listRenderApprovals } from "@/lib/video/render-approvals"
import { releaseQuota, reserveQuota } from "@/lib/quota"
import { RENDER_UNITS } from "@/lib/model-pricing"
import type {
  RenderExportPreset,
  RenderQualityProfile,
} from "@/lib/video/render-types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function requiredString(value: unknown, message: string): string {
  const text = typeof value === "string" ? value.trim() : ""
  if (!text) throw new InputError(message)
  return text
}

function requiredInteger(value: unknown, message: string): number {
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number < 0 || number > 9999) {
    throw new InputError(message)
  }
  return number
}

function qualityProfile(value: unknown): RenderQualityProfile {
  return value === "delivery" ? "delivery" : "preview"
}

function exportPreset(value: unknown): RenderExportPreset {
  return value === "landscape" || value === "square" ? value : "vertical"
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const projectId = requiredString(url.searchParams.get("projectId"), "缺少 projectId")
    const episodeValue = url.searchParams.get("episode")
    const episode = episodeValue === null
      ? undefined
      : requiredInteger(episodeValue, "集号不正确")
    const db = getDbForRequest()
    assertProjectAccess(db, projectId, resolveProjectOwner(db, req))
    // 页面轮询也会续跑队列，服务重启后无需用户重新点击历史 queued 任务。
    scheduleVideoRenderQueue(db)
    const stored = listVideoRenders(db, projectId, episode)
    const approvals = listRenderApprovals(db, projectId, stored.map((render) => render.id))
    return NextResponse.json(ok({
      renders: stored.map((render) => {
        const approval = approvals.get(render.id)
        return {
          ...toVideoRenderDto(render),
          approvalStatus: approval?.status ?? null,
          approvalNote: approval?.note ?? "",
          approvalReviewedAt: approval?.reviewedAt ?? null,
        }
      }),
    }), { headers: { "cache-control": "no-store" } })
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

export async function POST(req: Request) {
  let quotaHoldId: string | null = null
  try {
    const db = getDbForRequest()
    const ownerId = resolveProjectOwner(db, req)
    const identity = resolveRequestIdentity(db, req)
    enforceApiRateLimit(db, req, "export", {
      identity,
    })
    const body = await req.json().catch(() => null)
    const projectId = requiredString(body?.projectId, "缺少 projectId")
    const episode = requiredInteger(body?.episode, "缺少集号")
    const timelineVersionId = requiredString(body?.timelineVersionId, "缺少时间线版本")
    const profile = qualityProfile(body?.qualityProfile)
    const preset = exportPreset(body?.exportPreset)
    assertProjectAccess(db, projectId, ownerId)
    const hold = reserveQuota(db, identity, "render", {
      units: RENDER_UNITS,
      ttlMs: 24 * 60 * 60_000,
    })
    quotaHoldId = hold.id
    const render = enqueueEpisodeRender(db, {
      projectId,
      episode,
      timelineVersionId,
      qualityProfile: profile,
      exportPreset: preset,
      quotaReservationId: hold.id,
      quotaUnits: RENDER_UNITS,
    })
    if (render.quotaReservationId !== hold.id) {
      releaseQuota(db, hold.id, "render_reused")
      quotaHoldId = null
    }
    scheduleVideoRenderQueue(db)
    return NextResponse.json(ok({
      render: toVideoRenderDto(render),
      created: render.status === "queued",
      quotaUnits: RENDER_UNITS,
    }), {
      status: 202,
      headers: { "cache-control": "no-store" },
    })
  } catch (error) {
    if (quotaHoldId) {
      releaseQuota(getDbForRequest(), quotaHoldId, error instanceof Error ? error.message : "render_enqueue_failed")
    }
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

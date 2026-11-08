import { NextResponse } from "next/server"

import { errorResponse, InputError, ok } from "@/lib/api"
import { assertProjectAccess } from "@/lib/assets/access"
import { latestSnapshot } from "@/lib/assets/repo"
import { getDbForRequest } from "@/lib/assets/store"
import type { Shot } from "@/lib/assets/types"
import { resolveProjectOwner, resolveRequestIdentity } from "@/lib/auth/request"
import { listGeneratedAssets } from "@/lib/generation/repo"
import { getMiniMaxSpeechAvailability } from "@/lib/audio/tts-model"
import { recommendSystemBgmTracks } from "@/lib/audio/system-bgm"
import { enforceApiRateLimit } from "@/lib/security/api-rate-limit"
import { buildStoryboardPreviewPlan } from "@/lib/production/storyboard-preview"
import { buildStoryboardExportQuote } from "@/lib/production/storyboard-export"
import {
  completeStoryboardExport,
  createStoryboardExport,
  failStoryboardExport,
  listStoryboardExports,
} from "@/lib/production/storyboard-export-repo"
import { renderStoryboardExport } from "@/lib/production/storyboard-export-service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

async function readProjectStoryboard(db: ReturnType<typeof getDbForRequest>, projectId: string) {
  const snapshot = latestSnapshot(db, projectId, "shots")
  const shots = Array.isArray(snapshot?.payload) ? snapshot.payload as Shot[] : []
  return buildStoryboardPreviewPlan({
    projectId,
    shots,
    assets: listGeneratedAssets(db, projectId),
  })
}

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const db = getDbForRequest()
    const { id: projectId } = await context.params
    assertProjectAccess(db, projectId, resolveProjectOwner(db, req))
    const preview = await readProjectStoryboard(db, projectId)
    const speech = getMiniMaxSpeechAvailability()
    const quote = buildStoryboardExportQuote({
      segments: preview.segments,
      ttsAvailable: speech.enabled,
      pricePer1kCharsMicros: speech.pricePer1kCharsMicros,
    })
    const bgm = recommendSystemBgmTracks(
      preview.segments.map((segment) => `${segment.action} ${segment.dialogue}`).join("\n"),
      1,
    )[0] ?? null
    return NextResponse.json(ok({
      exports: listStoryboardExports(db, projectId),
      options: {
        quote,
        bgm: bgm ? { id: bgm.id, name: bgm.name, mood: bgm.mood ?? null } : null,
      },
    }), { headers: { "cache-control": "no-store" } })
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  let exportId = ""
  let projectId = ""
  const db = getDbForRequest()
  try {
    projectId = (await context.params).id
    const ownerId = resolveProjectOwner(db, req)
    const identity = resolveRequestIdentity(db, req)
    enforceApiRateLimit(db, req, "export", { identity })
    assertProjectAccess(db, projectId, ownerId)
    const body = await req.json().catch(() => null)
    const includeNarration = body?.includeNarration !== false
    const includeBgm = body?.includeBgm !== false
    const preview = await readProjectStoryboard(db, projectId)
    if (preview.status !== "ready") {
      throw new InputError("动态分镜尚未达到 30 秒，暂时不能导出")
    }
    const created = createStoryboardExport(db, projectId, {
      includeNarration,
      includeBgm,
    })
    exportId = created.id
    const rendered = await renderStoryboardExport({
      db,
      projectId,
      exportId,
      identity,
      includeNarration,
      includeBgm,
      signal: req.signal,
    })
    const completed = completeStoryboardExport(db, projectId, exportId, rendered)
    return NextResponse.json(ok({ export: completed }), {
      headers: { "cache-control": "no-store" },
    })
  } catch (error) {
    if (projectId && exportId) {
      failStoryboardExport(
        db,
        projectId,
        exportId,
        error instanceof Error ? error.message : "动态分镜导出失败",
      )
    }
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

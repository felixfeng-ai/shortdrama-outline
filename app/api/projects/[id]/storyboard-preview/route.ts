import { NextResponse } from "next/server"

import { errorResponse, ok } from "@/lib/api"
import { assertProjectAccess } from "@/lib/assets/access"
import { latestSnapshot } from "@/lib/assets/repo"
import { getDbForRequest } from "@/lib/assets/store"
import type { Shot } from "@/lib/assets/types"
import { resolveProjectOwner } from "@/lib/auth/request"
import { listGeneratedAssets } from "@/lib/generation/repo"
import { auditProductionAcceptance } from "@/lib/production/acceptance-audit"
import { buildStoryboardPreviewPlan } from "@/lib/production/storyboard-preview"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const db = getDbForRequest()
    const params = await context.params
    assertProjectAccess(db, params.id, resolveProjectOwner(db, req))
    const snapshot = latestSnapshot(db, params.id, "shots")
    const shots = Array.isArray(snapshot?.payload) ? snapshot.payload as Shot[] : []
    const preview = buildStoryboardPreviewPlan({
      projectId: params.id,
      shots,
      assets: listGeneratedAssets(db, params.id),
    })
    const episodeNumbers = shots
      .map((shot) => shot.episode)
      .filter((episode) => episode >= 1)
    const expectedEpisodes = Math.max(1, ...new Set(episodeNumbers))
    const acceptance = auditProductionAcceptance(
      db,
      params.id,
      Date.now(),
      expectedEpisodes,
    )
    return NextResponse.json(ok({
      preview,
      acceptance: {
        verdict: acceptance.verdict,
        nextAction: acceptance.nextAction,
        counts: acceptance.counts,
      },
    }), { headers: { "cache-control": "no-store" } })
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

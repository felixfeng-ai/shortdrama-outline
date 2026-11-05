import { NextResponse } from "next/server"

import { InputError, errorResponse, ok } from "@/lib/api"
import { assertProjectAccess } from "@/lib/assets/access"
import { getDbForRequest } from "@/lib/assets/store"
import { resolveProjectOwner } from "@/lib/auth/request"
import { listLatestTimelineVersions } from "@/lib/timeline/repo"
import { preflightTimelineVersion } from "@/lib/video/render-service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const projectId = url.searchParams.get("projectId")?.trim() ?? ""
    if (!projectId) throw new InputError("缺少 projectId")
    const db = getDbForRequest()
    assertProjectAccess(db, projectId, resolveProjectOwner(db, req))
    const versions = listLatestTimelineVersions(db, projectId).map((version) => {
      let issueCount = version.payload.blockedCount
      try {
        issueCount = preflightTimelineVersion(db, projectId, version.id).issues.length
      } catch {
        issueCount = Math.max(1, version.payload.blockedCount)
      }
      return {
        episode: version.episode,
        versionId: version.id,
        revision: version.revision,
        readyCount: version.payload.readyCount,
        blockedCount: version.payload.blockedCount,
        issueCount,
        totalDurationMs: version.payload.totalDurationMs,
      }
    })
    return NextResponse.json(ok({ versions }), {
      headers: { "cache-control": "no-store" },
    })
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

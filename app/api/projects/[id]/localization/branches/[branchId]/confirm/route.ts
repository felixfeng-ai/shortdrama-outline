import { NextResponse } from "next/server"

import { errorResponse, ok } from "@/lib/api"
import { assertProjectAccess } from "@/lib/assets/access"
import { getDbForRequest } from "@/lib/assets/store"
import { resolveProjectOwner } from "@/lib/auth/request"
import {
  normalizeLocalizedEpisodes,
  saveLocalizedEpisodes,
} from "@/lib/localization/adapt"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteContext = {
  params: { id: string; branchId: string } | Promise<{ id: string; branchId: string }>
}

export async function POST(req: Request, context: RouteContext) {
  try {
    const requestBody = await req.json().catch(() => null)
    const db = getDbForRequest()
    const ownerId = resolveProjectOwner(db, req)
    const params = await context.params
    assertProjectAccess(db, params.id, ownerId)
    const sourceSnapshotId = typeof requestBody?.sourceSnapshotId === "string"
      ? requestBody.sourceSnapshotId
      : ""
    if (!sourceSnapshotId) {
      return NextResponse.json(
        { success: false, data: null, error: "缺少源分集快照" },
        { status: 400 },
      )
    }
    const items = normalizeLocalizedEpisodes(requestBody?.items)
    return NextResponse.json(ok({
      snapshot: saveLocalizedEpisodes(
        db,
        params.id,
        params.branchId,
        ownerId,
        sourceSnapshotId,
        items,
      ),
    }), { headers: { "cache-control": "no-store" } })
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

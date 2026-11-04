import { NextResponse } from "next/server"

import { errorResponse, ok } from "@/lib/api"
import { assertProjectAccess } from "@/lib/assets/access"
import { latestSnapshot } from "@/lib/assets/repo"
import { getDbForRequest } from "@/lib/assets/store"
import { resolveProjectOwner } from "@/lib/auth/request"
import { getBranchContext } from "@/lib/localization/context"
import {
  analyzeVisualLocalization,
  saveLocalizedVisualShots,
} from "@/lib/localization/visual"

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
    const contextData = getBranchContext(db, params.id, params.branchId, ownerId)
    if (!contextData) {
      return NextResponse.json(
        { success: false, data: null, error: "请先保存目标市场与本地化上下文" },
        { status: 400 },
      )
    }
    const source = latestSnapshot(db, params.id, "shots")
    if (!source?.payload || !Array.isArray(source.payload)) {
      return NextResponse.json(
        { success: false, data: null, error: "当前项目还没有分镜快照" },
        { status: 400 },
      )
    }
    const suggestions = analyzeVisualLocalization(
      source.payload as Array<Record<string, unknown>>,
      contextData,
    )
    if (requestBody?.commit !== true) {
      return NextResponse.json(ok({ suggestions, sourceSnapshotId: source.id }), {
        headers: { "cache-control": "no-store" },
      })
    }
    const selected = Array.isArray(requestBody?.suggestions)
      ? requestBody.suggestions
      : suggestions
    return NextResponse.json(ok({
      snapshot: saveLocalizedVisualShots(
        db,
        params.id,
        params.branchId,
        ownerId,
        source.id,
        selected,
      ),
    }), { headers: { "cache-control": "no-store" } })
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

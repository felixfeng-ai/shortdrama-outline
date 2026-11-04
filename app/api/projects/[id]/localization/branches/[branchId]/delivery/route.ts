import { NextResponse } from "next/server"

import { errorResponse, ok } from "@/lib/api"
import { assertProjectAccess } from "@/lib/assets/access"
import { getDbForRequest } from "@/lib/assets/store"
import { resolveProjectOwner } from "@/lib/auth/request"
import { normalizeLocalizedEpisodes } from "@/lib/localization/adapt"
import {
  getBranchContext,
  listGlossary,
} from "@/lib/localization/context"
import { buildLocalizationDelivery } from "@/lib/localization/delivery"

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
    const branchContext = getBranchContext(db, params.id, params.branchId, ownerId)
    if (!branchContext) {
      return NextResponse.json(
        { success: false, data: null, error: "请先保存目标市场与本地化上下文" },
        { status: 400 },
      )
    }
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
    const glossary = listGlossary(db, params.id, params.branchId, ownerId)
    return NextResponse.json(ok(buildLocalizationDelivery({
      title: typeof requestBody?.title === "string" ? requestBody.title : "本地化交付",
      projectId: params.id,
      branchId: params.branchId,
      sourceSnapshotId,
      context: branchContext,
      glossary,
      items,
      visualNotes: Array.isArray(requestBody?.visualNotes)
        ? requestBody.visualNotes.map(String)
        : [],
    })), { headers: { "cache-control": "no-store" } })
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

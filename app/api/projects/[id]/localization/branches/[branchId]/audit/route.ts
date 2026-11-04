import { NextResponse } from "next/server"

import { errorResponse, ok } from "@/lib/api"
import { assertProjectAccess } from "@/lib/assets/access"
import { getDbForRequest } from "@/lib/assets/store"
import { resolveProjectOwner } from "@/lib/auth/request"
import { normalizeLocalizedEpisodes } from "@/lib/localization/adapt"
import {
  auditLocalization,
  getLatestLocalizationAudit,
  saveLocalizationAudit,
} from "@/lib/localization/audit"
import {
  getBranchCanon,
  getBranchContext,
  listGlossary,
} from "@/lib/localization/context"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteContext = {
  params: { id: string; branchId: string } | Promise<{ id: string; branchId: string }>
}

export async function GET(req: Request, context: RouteContext) {
  try {
    const db = getDbForRequest()
    const ownerId = resolveProjectOwner(db, req)
    const params = await context.params
    assertProjectAccess(db, params.id, ownerId)
    return NextResponse.json(ok({
      audit: getLatestLocalizationAudit(db, params.id, params.branchId, ownerId),
    }), { headers: { "cache-control": "no-store" } })
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
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
        { success: false, data: null, error: "请先保存本地化市场上下文" },
        { status: 400 },
      )
    }
    const items = normalizeLocalizedEpisodes(requestBody?.items)
    const canon = getBranchCanon(db, params.id, params.branchId, ownerId)
    const report = auditLocalization({
      projectId: params.id,
      branchId: params.branchId,
      context: branchContext,
      glossary: listGlossary(db, params.id, params.branchId, ownerId),
      items,
      canonIssues: canon.issues,
    })
    const sourceSnapshotId = typeof requestBody?.sourceSnapshotId === "string"
      ? requestBody.sourceSnapshotId
      : ""
    if (!sourceSnapshotId) {
      return NextResponse.json(
        { success: false, data: null, error: "缺少 sourceSnapshotId" },
        { status: 400 },
      )
    }
    return NextResponse.json(ok({
      audit: saveLocalizationAudit(
        db,
        params.id,
        params.branchId,
        ownerId,
        sourceSnapshotId,
        report,
      ),
    }), { headers: { "cache-control": "no-store" } })
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

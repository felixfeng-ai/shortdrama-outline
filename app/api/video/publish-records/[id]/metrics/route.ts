import { NextResponse } from "next/server"

import { InputError, errorResponse, ok } from "@/lib/api"
import { assertProjectAccess } from "@/lib/assets/access"
import { getDbForRequest } from "@/lib/assets/store"
import { resolveProjectOwner } from "@/lib/auth/request"
import {
  addPublishMetric,
  getPublishSummary,
} from "@/lib/delivery/publish"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const body = await req.json().catch(() => null)
    const projectId = typeof body?.projectId === "string" ? body.projectId.trim() : ""
    const packageId = typeof body?.packageId === "string" ? body.packageId.trim() : ""
    if (!projectId || !packageId) throw new InputError("缺少 projectId 或 packageId")
    const db = getDbForRequest()
    assertProjectAccess(db, projectId, resolveProjectOwner(db, req))
    const params = await context.params
    const record = db.prepare(
      "SELECT package_id FROM video_publish_records WHERE id = ?",
    ).get(params.id) as { package_id: string } | undefined
    if (!record || record.package_id !== packageId) throw new InputError("发布记录不存在")
    const metric = addPublishMetric(db, {
      publishRecordId: params.id,
      capturedAt: Number(body?.capturedAt) || Date.now(),
      views: Number(body?.views) || 0,
      views3s: Number(body?.views3s) || 0,
      completionRate: Number(body?.completionRate) || 0,
      likes: Number(body?.likes) || 0,
      comments: Number(body?.comments) || 0,
      shares: Number(body?.shares) || 0,
      costUnits: Number(body?.costUnits) || 0,
    })
    return NextResponse.json(ok({
      metric,
      summary: getPublishSummary(db, packageId),
    }), { status: 201 })
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

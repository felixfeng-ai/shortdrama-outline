import { NextResponse } from "next/server"

import { InputError, errorResponse, ok } from "@/lib/api"
import { assertProjectAccess } from "@/lib/assets/access"
import { getDbForRequest } from "@/lib/assets/store"
import { resolveProjectOwner } from "@/lib/auth/request"
import { deliveryPackageDto } from "@/lib/delivery/dto"
import {
  createPublishRecord,
  listLatestPublishMetrics,
  listPublishRecords,
} from "@/lib/delivery/publish"
import { getDeliveryPackage } from "@/lib/delivery/repo"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const url = new URL(req.url)
    const projectId = url.searchParams.get("projectId")?.trim() ?? ""
    if (!projectId) throw new InputError("缺少 projectId")
    const db = getDbForRequest()
    assertProjectAccess(db, projectId, resolveProjectOwner(db, req))
    const params = await context.params
    const pkg = getDeliveryPackage(db, projectId, params.id)
    if (!pkg) throw new InputError("交付包不存在")
    return NextResponse.json(ok({
      records: listPublishRecords(db, pkg.id),
      metrics: listLatestPublishMetrics(db, pkg.id),
      package: deliveryPackageDto(db, pkg, { includePublish: true }),
    }))
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const body = await req.json().catch(() => null)
    const projectId = typeof body?.projectId === "string" ? body.projectId.trim() : ""
    if (!projectId) throw new InputError("缺少 projectId")
    const db = getDbForRequest()
    assertProjectAccess(db, projectId, resolveProjectOwner(db, req))
    const params = await context.params
    if (!getDeliveryPackage(db, projectId, params.id)) throw new InputError("交付包不存在")
    return NextResponse.json(ok({
      record: createPublishRecord(db, {
        packageId: params.id,
        itemId: String(body?.itemId ?? ""),
        platform: String(body?.platform ?? ""),
        status: body?.status === "published" || body?.status === "failed"
          ? body.status
          : "ready",
        publishedUrl: String(body?.publishedUrl ?? ""),
        publishedAt: Number(body?.publishedAt) || null,
        note: String(body?.note ?? ""),
      }),
    }), { status: 201 })
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

import { NextResponse } from "next/server"

import { InputError, errorResponse, ok } from "@/lib/api"
import { assertProjectAccess } from "@/lib/assets/access"
import { getDbForRequest } from "@/lib/assets/store"
import { resolveProjectOwner } from "@/lib/auth/request"
import { getDeliveryPackage } from "@/lib/delivery/repo"
import {
  createDeliveryReviewLink,
  listDeliveryReviewLinks,
} from "@/lib/delivery/review"

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
    if (!getDeliveryPackage(db, projectId, params.id)) throw new InputError("交付包不存在")
    return NextResponse.json(ok({ links: listDeliveryReviewLinks(db, params.id) }))
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
    const created = createDeliveryReviewLink(db, {
      packageId: params.id,
      reviewerName: String(body?.reviewerName ?? ""),
      roleLabel: String(body?.roleLabel ?? ""),
      ttlMs: Number(body?.ttlMs) > 0 ? Number(body.ttlMs) : undefined,
    })
    return NextResponse.json(ok({
      link: created.link,
      token: created.token,
      reviewUrl: `/review/${created.token}`,
    }), { status: 201 })
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

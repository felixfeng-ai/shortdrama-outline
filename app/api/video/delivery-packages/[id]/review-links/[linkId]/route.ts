import { NextResponse } from "next/server"

import { InputError, errorResponse, ok } from "@/lib/api"
import { assertProjectAccess } from "@/lib/assets/access"
import { getDbForRequest } from "@/lib/assets/store"
import { resolveProjectOwner } from "@/lib/auth/request"
import { getDeliveryPackage } from "@/lib/delivery/repo"
import { revokeDeliveryReviewLink } from "@/lib/delivery/review"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function DELETE(
  req: Request,
  context: { params: Promise<{ id: string; linkId: string }> },
) {
  try {
    const url = new URL(req.url)
    const projectId = url.searchParams.get("projectId")?.trim() ?? ""
    if (!projectId) throw new InputError("缺少 projectId")
    const db = getDbForRequest()
    assertProjectAccess(db, projectId, resolveProjectOwner(db, req))
    const params = await context.params
    if (!getDeliveryPackage(db, projectId, params.id)) throw new InputError("交付包不存在")
    return NextResponse.json(ok({
      revoked: revokeDeliveryReviewLink(db, params.id, params.linkId),
    }))
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

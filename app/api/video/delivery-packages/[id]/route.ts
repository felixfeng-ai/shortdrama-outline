import { NextResponse } from "next/server"

import { InputError, errorResponse, ok } from "@/lib/api"
import { assertProjectAccess } from "@/lib/assets/access"
import { getDbForRequest } from "@/lib/assets/store"
import { resolveProjectOwner } from "@/lib/auth/request"
import { deliveryPackageDto } from "@/lib/delivery/dto"
import { scheduleDeliveryPackageQueue } from "@/lib/delivery/queue"
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
    scheduleDeliveryPackageQueue(db)
    return NextResponse.json(ok({
      package: deliveryPackageDto(db, pkg, { includePublish: true }),
    }), { headers: { "cache-control": "no-store" } })
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

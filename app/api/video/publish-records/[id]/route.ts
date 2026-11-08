import { NextResponse } from "next/server"

import { InputError, errorResponse, ok } from "@/lib/api"
import { assertProjectAccess } from "@/lib/assets/access"
import { getDbForRequest } from "@/lib/assets/store"
import { resolveProjectOwner } from "@/lib/auth/request"
import { updatePublishRecord } from "@/lib/delivery/publish"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function PATCH(
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
    return NextResponse.json(ok({
      record: updatePublishRecord(db, packageId, params.id, {
        status: body?.status === "published" || body?.status === "failed" || body?.status === "ready"
          ? body.status
          : undefined,
        publishedUrl: typeof body?.publishedUrl === "string" ? body.publishedUrl : undefined,
        publishedAt: body?.publishedAt === null
          ? null
          : Number(body?.publishedAt) || undefined,
        note: typeof body?.note === "string" ? body.note : undefined,
      }),
    }))
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

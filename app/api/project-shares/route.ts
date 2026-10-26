import { NextResponse } from "next/server"

import { InputError, errorResponse, ok } from "@/lib/api"
import { getDbForRequest } from "@/lib/assets/store"
import { createProjectShare } from "@/lib/assets/shares"
import { resolveProjectOwner } from "@/lib/auth/request"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)
    const projectId = typeof body?.projectId === "string" ? body.projectId.trim() : ""
    if (!projectId) throw new InputError("缺少项目")
    const db = getDbForRequest()
    const share = createProjectShare(
      db,
      projectId,
      resolveProjectOwner(db, req),
      { ttlDays: 7 },
    )
    return NextResponse.json(ok({
      share: {
        id: share.id,
        token: share.token,
        path: `/share/${encodeURIComponent(share.token)}`,
        expiresAt: share.expiresAt,
      },
    }))
  } catch (error) {
    const { body, status } = errorResponse(error)
    return NextResponse.json(body, { status })
  }
}

import { NextResponse } from "next/server"

import { errorResponse, ok } from "@/lib/api"
import { assertProjectAccess } from "@/lib/assets/access"
import { getDbForRequest } from "@/lib/assets/store"
import { resolveProjectOwner } from "@/lib/auth/request"
import { assertNovelAccess } from "@/lib/novels/access"
import { pauseNovelRun } from "@/lib/novels/repo"

export const runtime = "nodejs"

type RouteContext = {
  params: { id: string; novelId: string } | Promise<{ id: string; novelId: string }>
}

export async function POST(req: Request, context: RouteContext) {
  try {
    const db = getDbForRequest()
    const ownerId = resolveProjectOwner(db, req)
    const { id, novelId } = await context.params
    assertProjectAccess(db, id, ownerId)
    assertNovelAccess(db, id, novelId, ownerId)
    return NextResponse.json(ok({ run: pauseNovelRun(db, novelId) }), {
      headers: { "cache-control": "no-store" },
    })
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

import { NextResponse } from "next/server"

import { errorResponse, ok } from "@/lib/api"
import { assertProjectAccess } from "@/lib/assets/access"
import { getDbForRequest } from "@/lib/assets/store"
import { resolveProjectOwner } from "@/lib/auth/request"
import { getAgentThread } from "@/lib/project-collaboration"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteContext = {
  params: { id: string; threadId: string } | Promise<{ id: string; threadId: string }>
}

export async function GET(req: Request, context: RouteContext) {
  try {
    const db = getDbForRequest()
    const ownerId = resolveProjectOwner(db, req)
    const params = await context.params
    assertProjectAccess(db, params.id, ownerId)
    const thread = getAgentThread(db, params.id, params.threadId, ownerId)
    if (!thread) {
      return NextResponse.json(
        { success: false, data: null, error: "会话不存在" },
        { status: 404 },
      )
    }
    return NextResponse.json(ok({ thread }), {
      headers: { "cache-control": "no-store" },
    })
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

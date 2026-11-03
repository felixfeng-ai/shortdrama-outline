import { NextResponse } from "next/server"

import { errorResponse, ok } from "@/lib/api"
import { assertProjectAccess } from "@/lib/assets/access"
import {
  getProjectContext,
  saveProjectContext,
} from "@/lib/assets/project-context"
import { getDbForRequest } from "@/lib/assets/store"
import { resolveProjectOwner } from "@/lib/auth/request"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteContext = { params: { id: string } | Promise<{ id: string }> }

export async function GET(req: Request, context: RouteContext) {
  try {
    const db = getDbForRequest()
    const ownerId = resolveProjectOwner(db, req)
    const params = await context.params
    assertProjectAccess(db, params.id, ownerId)
    return NextResponse.json(ok({
      context: getProjectContext(db, params.id),
    }), { headers: { "cache-control": "no-store" } })
  } catch (error) {
    const { body, status } = errorResponse(error)
    return NextResponse.json(body, { status })
  }
}

export async function PUT(req: Request, context: RouteContext) {
  try {
    const body = await req.json().catch(() => null)
    const db = getDbForRequest()
    const ownerId = resolveProjectOwner(db, req)
    const params = await context.params
    assertProjectAccess(db, params.id, ownerId)
    const projectContext = saveProjectContext(db, params.id, ownerId, {
      brief: body?.brief,
      look: body?.look,
      episodeCount: body?.episodeCount,
      version: body?.version,
    })
    return NextResponse.json(ok({ context: projectContext }), {
      headers: { "cache-control": "no-store" },
    })
  } catch (error) {
    const { body, status } = errorResponse(error)
    return NextResponse.json(body, { status })
  }
}

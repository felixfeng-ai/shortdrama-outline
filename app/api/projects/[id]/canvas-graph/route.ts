import { NextResponse } from "next/server"

import { errorResponse, fail, ok } from "@/lib/api"
import { assertProjectAccess } from "@/lib/assets/access"
import { getDbForRequest } from "@/lib/assets/store"
import { resolveProjectOwner } from "@/lib/auth/request"
import { CanvasGraphError } from "@/lib/canvas-graph"
import {
  CanvasGraphConflictError,
  loadCanvasGraph,
  saveCanvasGraph,
} from "@/lib/canvas-graph-repo"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteContext = { params: { id: string } | Promise<{ id: string }> }

export async function GET(req: Request, context: RouteContext) {
  try {
    const db = getDbForRequest()
    const ownerId = resolveProjectOwner(db, req)
    const params = await context.params
    assertProjectAccess(db, params.id, ownerId)
    return NextResponse.json(ok(loadCanvasGraph(db, params.id)), {
      headers: { "cache-control": "no-store" },
    })
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

export async function PUT(req: Request, context: RouteContext) {
  try {
    const body = await req.json().catch(() => null)
    const db = getDbForRequest()
    const ownerId = resolveProjectOwner(db, req)
    const params = await context.params
    assertProjectAccess(db, params.id, ownerId)
    const record = saveCanvasGraph(
      db,
      params.id,
      ownerId,
      body?.graph,
      Number(body?.expectedRevision),
    )
    return NextResponse.json(ok(record), {
      headers: { "cache-control": "no-store" },
    })
  } catch (error) {
    if (error instanceof CanvasGraphConflictError) {
      return NextResponse.json({
        ...fail(error.message),
        data: { latest: error.latest },
      }, { status: 409 })
    }
    if (error instanceof CanvasGraphError) {
      return NextResponse.json(fail(error.message), { status: 400 })
    }
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

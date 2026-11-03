import { NextResponse } from "next/server"

import { errorResponse, ok } from "@/lib/api"
import { assertProjectAccess } from "@/lib/assets/access"
import {
  createProjectDecision,
  listProjectDecisions,
  listProjectJudgments,
} from "@/lib/assets/decisions"
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
      decisions: listProjectDecisions(db, params.id),
      judgments: listProjectJudgments(db, params.id),
    }), { headers: { "cache-control": "no-store" } })
  } catch (error) {
    const { body, status } = errorResponse(error)
    return NextResponse.json(body, { status })
  }
}

export async function POST(req: Request, context: RouteContext) {
  try {
    const body = await req.json().catch(() => null)
    const db = getDbForRequest()
    const ownerId = resolveProjectOwner(db, req)
    const params = await context.params
    assertProjectAccess(db, params.id, ownerId)
    return NextResponse.json(ok({
      decision: createProjectDecision(db, params.id, ownerId, body ?? {}),
    }), { headers: { "cache-control": "no-store" } })
  } catch (error) {
    const { body, status } = errorResponse(error)
    return NextResponse.json(body, { status })
  }
}

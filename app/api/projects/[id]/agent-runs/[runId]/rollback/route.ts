import { NextResponse } from "next/server"

import { errorResponse, fail, ok } from "@/lib/api"
import { assertProjectAccess } from "@/lib/assets/access"
import { getDbForRequest } from "@/lib/assets/store"
import { resolveProjectOwner } from "@/lib/auth/request"
import {
  AgentRunConflictError,
  rollbackAgentAction,
} from "@/lib/agent/runs"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteContext = {
  params: { id: string; runId: string } | Promise<{ id: string; runId: string }>
}

export async function POST(req: Request, context: RouteContext) {
  try {
    const db = getDbForRequest()
    const ownerId = resolveProjectOwner(db, req)
    const params = await context.params
    assertProjectAccess(db, params.id, ownerId)
    const result = rollbackAgentAction(db, params.id, params.runId)
    return NextResponse.json(ok({
      run: result.run,
      snapshot: {
        id: result.snapshot.id,
        version: result.snapshot.version,
      },
      payload: result.payload,
    }), { headers: { "cache-control": "no-store" } })
  } catch (error) {
    if (error instanceof AgentRunConflictError) {
      return NextResponse.json(fail(error.message), { status: 409 })
    }
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

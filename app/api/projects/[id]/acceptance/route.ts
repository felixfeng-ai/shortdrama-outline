import { NextResponse } from "next/server"

import { errorResponse, ok } from "@/lib/api"
import { assertProjectAccess } from "@/lib/assets/access"
import { getDbForRequest } from "@/lib/assets/store"
import { resolveProjectOwner } from "@/lib/auth/request"
import { auditProductionAcceptance } from "@/lib/production/acceptance-audit"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const db = getDbForRequest()
    const params = await context.params
    assertProjectAccess(db, params.id, resolveProjectOwner(db, req))
    return NextResponse.json(ok({
      audit: auditProductionAcceptance(db, params.id),
    }), { headers: { "cache-control": "no-store" } })
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

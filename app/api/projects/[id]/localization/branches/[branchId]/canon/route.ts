import { NextResponse } from "next/server"

import { errorResponse, ok } from "@/lib/api"
import { assertProjectAccess } from "@/lib/assets/access"
import { getDbForRequest } from "@/lib/assets/store"
import { resolveProjectOwner } from "@/lib/auth/request"
import {
  createBranchCanonFact,
  getBranchCanon,
} from "@/lib/localization/context"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteContext = {
  params: { id: string; branchId: string } | Promise<{ id: string; branchId: string }>
}

export async function GET(req: Request, context: RouteContext) {
  try {
    const db = getDbForRequest()
    const ownerId = resolveProjectOwner(db, req)
    const params = await context.params
    assertProjectAccess(db, params.id, ownerId)
    return NextResponse.json(ok({
      canon: getBranchCanon(db, params.id, params.branchId, ownerId),
    }), { headers: { "cache-control": "no-store" } })
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

export async function POST(req: Request, context: RouteContext) {
  try {
    const requestBody = await req.json().catch(() => null)
    const db = getDbForRequest()
    const ownerId = resolveProjectOwner(db, req)
    const params = await context.params
    assertProjectAccess(db, params.id, ownerId)
    return NextResponse.json(ok({
      fact: createBranchCanonFact(
        db,
        params.id,
        params.branchId,
        ownerId,
        requestBody ?? {},
      ),
      canon: getBranchCanon(db, params.id, params.branchId, ownerId),
    }), { headers: { "cache-control": "no-store" } })
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

import { NextResponse } from "next/server"

import { errorResponse, ok } from "@/lib/api"
import { assertProjectAccess } from "@/lib/assets/access"
import { createCanonFact, getProjectCanon } from "@/lib/assets/canon"
import { getDbForRequest } from "@/lib/assets/store"
import { resolveProjectOwner } from "@/lib/auth/request"

// Canon 是项目级只读审计数据；读取和写入都必须先通过项目归属校验，
// 不能因为知道 projectId 就读取其他匿名会话或账号的连续性事实。
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteContext = { params: { id: string } | Promise<{ id: string }> }

export async function GET(req: Request, context: RouteContext) {
  try {
    const db = getDbForRequest()
    const ownerId = resolveProjectOwner(db, req)
    const params = await context.params
    assertProjectAccess(db, params.id, ownerId)
    return NextResponse.json(ok(getProjectCanon(db, params.id)), {
      headers: { "cache-control": "no-store" },
    })
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
      fact: createCanonFact(db, params.id, body ?? {}),
      canon: getProjectCanon(db, params.id),
    }), { headers: { "cache-control": "no-store" } })
  } catch (error) {
    const { body, status } = errorResponse(error)
    return NextResponse.json(body, { status })
  }
}

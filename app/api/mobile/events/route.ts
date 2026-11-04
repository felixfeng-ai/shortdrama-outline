import { NextResponse } from "next/server"

import { errorResponse, ok } from "@/lib/api"
import { getDbForRequest } from "@/lib/assets/store"
import { resolveProjectOwner } from "@/lib/auth/request"
import { readAnalyticsBatch, recordAnalyticsBatch } from "@/lib/analytics/repo"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  try {
    const db = getDbForRequest()
    const batch = readAnalyticsBatch(await req.json().catch(() => null))
    const recorded = recordAnalyticsBatch(db, resolveProjectOwner(db, req), batch)
    return NextResponse.json(ok({ recorded }))
  } catch (error) {
    const { body, status } = errorResponse(error)
    return NextResponse.json(body, { status })
  }
}

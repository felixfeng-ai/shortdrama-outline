import { NextResponse } from "next/server"

import { errorResponse, ok } from "@/lib/api"
import { getDbForRequest } from "@/lib/assets/store"
import { resolveProjectOwner } from "@/lib/auth/request"
import {
  createMobileFeedback,
  listMobileFeedback,
} from "@/lib/mobile-feedback"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  try {
    const db = getDbForRequest()
    const ownerId = resolveProjectOwner(db, req)
    return NextResponse.json(ok({
      feedback: listMobileFeedback(db, ownerId),
    }), { headers: { "cache-control": "no-store" } })
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

export async function POST(req: Request) {
  try {
    const db = getDbForRequest()
    const ownerId = resolveProjectOwner(db, req)
    const feedback = createMobileFeedback(
      db,
      ownerId,
      await req.json().catch(() => null),
    )
    return NextResponse.json(ok({ feedback }), {
      headers: { "cache-control": "no-store" },
    })
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

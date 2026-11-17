import { NextResponse } from "next/server"

import { errorResponse, ok } from "@/lib/api"
import { getDbForRequest } from "@/lib/assets/store"
import { resolveProjectOwner, resolveRequestIdentity } from "@/lib/auth/request"
import { enforceApiRateLimit } from "@/lib/security/api-rate-limit"
import { readWebVitalEvent, recordWebVitalEvent } from "@/lib/web-vitals"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  try {
    const db = getDbForRequest()
    enforceApiRateLimit(db, req, "vitals", {
      identity: resolveRequestIdentity(db, req),
    })
    const event = readWebVitalEvent(await req.json().catch(() => null))
    recordWebVitalEvent(db, resolveProjectOwner(db, req), event)
    return NextResponse.json(ok({ recorded: 1 }), {
      headers: { "cache-control": "no-store" },
    })
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

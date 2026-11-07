import { NextResponse } from "next/server"

import { ok } from "@/lib/api"
import { getDbForRequest } from "@/lib/assets/store"
import { resolveRequestIdentity } from "@/lib/auth/request"
import { getApiRateLimitAvailability } from "@/lib/security/api-rate-limit"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const db = getDbForRequest()
  const availability = getApiRateLimitAvailability(db, req, "image", {
    identity: resolveRequestIdentity(db, req),
  })
  return NextResponse.json(ok(availability), {
    headers: { "Cache-Control": "no-store" },
  })
}

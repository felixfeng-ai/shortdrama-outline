import { NextResponse, type NextRequest } from "next/server"

import { AUTH_COOKIE } from "@/lib/auth/request"
import { createDomainHandoffToken } from "@/lib/auth/domain-handoff"
import { CANONICAL_ORIGIN, safeInternalPath } from "@/lib/domain"
import { SESSION_COOKIE } from "@/lib/session"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const returnTo = safeInternalPath(request.nextUrl.searchParams.get("returnTo"))
  const secret = process.env.DOMAIN_HANDOFF_SECRET || process.env.AUTH_SECRET
  const target = new URL("/api/domain-migration/complete", CANONICAL_ORIGIN)
  if (secret) {
    target.searchParams.set("token", createDomainHandoffToken({
      anonymousSession: request.cookies.get(SESSION_COOKIE)?.value,
      authToken: request.cookies.get(AUTH_COOKIE)?.value,
      returnTo,
    }, secret))
  } else {
    target.searchParams.set("returnTo", returnTo)
    target.searchParams.set("handoff", "unavailable")
  }
  const response = NextResponse.redirect(target, 307)
  response.headers.set("cache-control", "no-store")
  response.headers.set("referrer-policy", "no-referrer")
  return response
}

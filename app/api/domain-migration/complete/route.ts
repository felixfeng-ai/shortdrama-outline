import { NextResponse, type NextRequest } from "next/server"

import { readDomainHandoffToken } from "@/lib/auth/domain-handoff"
import { AUTH_COOKIE } from "@/lib/auth/request"
import { canonicalUrl, safeInternalPath } from "@/lib/domain"
import { isSessionId, SESSION_COOKIE } from "@/lib/session"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const secret = process.env.DOMAIN_HANDOFF_SECRET || process.env.AUTH_SECRET
  const token = request.nextUrl.searchParams.get("token")
  const fallbackPath = safeInternalPath(request.nextUrl.searchParams.get("returnTo"))
  const payload = secret ? readDomainHandoffToken(token, secret) : null
  const response = NextResponse.redirect(canonicalUrl(payload?.returnTo ?? fallbackPath), 303)
  response.headers.set("cache-control", "no-store")
  response.headers.set("referrer-policy", "no-referrer")

  if (payload?.anonymousSession && isSessionId(payload.anonymousSession)) {
    response.cookies.set(SESSION_COOKIE, payload.anonymousSession, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    })
  }
  if (payload?.authToken) {
    response.cookies.set(AUTH_COOKIE, payload.authToken, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 30 * 24 * 60 * 60,
    })
  }
  return response
}

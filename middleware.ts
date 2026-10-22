import { NextResponse, type NextRequest } from "next/server"
import { isSessionId, LOCAL_SESSION_ID, makeSessionId, SESSION_COOKIE } from "./lib/session"

export function middleware(req: NextRequest) {
  const existing = req.cookies.get(SESSION_COOKIE)?.value
  const local = req.nextUrl.hostname === "localhost" || req.nextUrl.hostname === "127.0.0.1" || req.nextUrl.hostname === "::1"
  if (local && existing === LOCAL_SESSION_ID) return NextResponse.next()
  if (!local && isSessionId(existing)) return NextResponse.next()

  const sessionId = local ? LOCAL_SESSION_ID : makeSessionId()
  const requestHeaders = new Headers(req.headers)
  const existingCookie = req.headers.get("cookie")
  requestHeaders.set(
    "cookie",
    existingCookie ? `${existingCookie}; ${SESSION_COOKIE}=${sessionId}` : `${SESSION_COOKIE}=${sessionId}`,
  )
  const response = NextResponse.next({ request: { headers: requestHeaders } })
  const secure = req.nextUrl.protocol === "https:" || req.headers.get("x-forwarded-proto") === "https"
  response.cookies.set(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  })
  return response
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|sitemap.xml).*)"],
}

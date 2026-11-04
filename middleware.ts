import { NextResponse, type NextRequest } from "next/server"
import { isSessionId, LOCAL_SESSION_ID, makeSessionId, SESSION_COOKIE } from "./lib/session"
import { corsHeaders, isAllowedOrigin, isLoopbackHost } from "./lib/cors"

function withCors(response: NextResponse, origin: string | null): NextResponse {
  if (!origin) return response
  for (const [key, value] of Object.entries(corsHeaders(origin))) {
    response.headers.set(key, value)
  }
  return response
}

export function middleware(req: NextRequest) {
  const isApi = req.nextUrl.pathname.startsWith("/api/")
  const requestOrigin = req.headers.get("origin")
  const localHost = isLoopbackHost(req.nextUrl.hostname)
  const originAllowed =
    isAllowedOrigin(requestOrigin, process.env) ||
    (localHost && isAllowedOrigin(requestOrigin, { NODE_ENV: "development" }))
  const origin = isApi && originAllowed ? requestOrigin : null
  if (isApi && req.method === "OPTIONS") {
    return withCors(new NextResponse(null, { status: 204 }), origin)
  }

  const existing = req.cookies.get(SESSION_COOKIE)?.value
  const local = req.nextUrl.hostname === "localhost" || req.nextUrl.hostname === "127.0.0.1" || req.nextUrl.hostname === "::1"
  if (local && existing === LOCAL_SESSION_ID) return withCors(NextResponse.next(), origin)
  if (!local && isSessionId(existing)) return withCors(NextResponse.next(), origin)

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
  return withCors(response, origin)
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|sitemap.xml).*)"],
}

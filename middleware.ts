import { NextResponse, type NextRequest } from "next/server"
import { isSessionId, LOCAL_SESSION_ID, makeSessionId, SESSION_COOKIE } from "./lib/session"

function firstHeader(value: string | null): string {
  return value?.split(",")[0]?.trim().toLowerCase() ?? ""
}

function hostnameFromRequest(req: NextRequest): string {
  const raw = firstHeader(req.headers.get("x-forwarded-host")) ||
    firstHeader(req.headers.get("host")) ||
    req.nextUrl.hostname.toLowerCase()
  if (raw.startsWith("[")) {
    const end = raw.indexOf("]")
    return end > 0 ? raw.slice(1, end) : raw
  }
  return raw.replace(/:\d+$/, "")
}

export function middleware(req: NextRequest) {
  const existing = req.cookies.get(SESSION_COOKIE)?.value
  const hostname = hostnameFromRequest(req)
  const forwardedProto = firstHeader(req.headers.get("x-forwarded-proto"))
  const https = forwardedProto === "https" || req.nextUrl.protocol === "https:"
  const localHostname = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1"
  // 生产 Nginx 也可能把上游地址解析成 localhost；公网 HTTPS 必须优先于主机名。
  const local = localHostname && !https
  if (local && existing === LOCAL_SESSION_ID) return NextResponse.next()
  if (!local && isSessionId(existing) && existing !== LOCAL_SESSION_ID) return NextResponse.next()

  const sessionId = local ? LOCAL_SESSION_ID : makeSessionId()
  const requestHeaders = new Headers(req.headers)
  const existingCookie = req.headers.get("cookie")
  requestHeaders.set(
    "cookie",
    existingCookie ? `${existingCookie}; ${SESSION_COOKIE}=${sessionId}` : `${SESSION_COOKIE}=${sessionId}`,
  )
  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.cookies.set(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: https,
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  })
  return response
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|sitemap.xml).*)"],
}

import { NextResponse, type NextRequest } from "next/server"
import { isSessionId, LOCAL_SESSION_ID, makeSessionId, SESSION_COOKIE } from "./lib/session"
import { corsHeaders, isAllowedOrigin, isLoopbackHost } from "./lib/cors"
import {
  CANONICAL_ORIGIN,
  isCanonicalWwwHost,
  isLegacyHost,
} from "./lib/domain"

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

function withCors(response: NextResponse, origin: string | null): NextResponse {
  if (!origin) return response
  for (const [key, value] of Object.entries(corsHeaders(origin))) {
    response.headers.set(key, value)
  }
  return response
}

function isDocumentNavigation(req: NextRequest): boolean {
  if (req.method !== "GET") return false
  return req.headers.get("sec-fetch-mode") === "navigate"
    || req.headers.get("accept")?.includes("text/html") === true
}

function enabled(value: string | undefined): boolean {
  return /^(1|true|yes|on)$/i.test(value ?? "")
}

export function proxy(req: NextRequest) {
  const isApi = req.nextUrl.pathname.startsWith("/api/")
  const requestOrigin = req.headers.get("origin")
  const originAllowed =
    isAllowedOrigin(requestOrigin, process.env) ||
    (isLoopbackHost(req.nextUrl.hostname) &&
      isAllowedOrigin(requestOrigin, { NODE_ENV: "development" }))
  const origin = isApi && originAllowed ? requestOrigin : null
  if (isApi && req.method === "OPTIONS") {
    return withCors(new NextResponse(null, { status: 204 }), origin)
  }

  const hostname = hostnameFromRequest(req)
  const requestPath = `${req.nextUrl.pathname}${req.nextUrl.search}`
  const forwardedProto = firstHeader(req.headers.get("x-forwarded-proto"))
  const https = forwardedProto === "https" || req.nextUrl.protocol === "https:"
  const currentOrigin = `${https ? "https" : "http"}://${hostname}`
  const domainMigrationEnabled = enabled(process.env.CHENGJU_DOMAIN_MIGRATION_ENABLED)

  if (domainMigrationEnabled && isCanonicalWwwHost(hostname)) {
    return withCors(NextResponse.redirect(new URL(requestPath, CANONICAL_ORIGIN), 301), origin)
  }

  if (domainMigrationEnabled && isLegacyHost(hostname) && req.nextUrl.pathname !== "/api/domain-migration/start") {
    if (isDocumentNavigation(req)) {
      const handoff = new URL("/api/domain-migration/start", currentOrigin)
      handoff.searchParams.set("returnTo", requestPath)
      return withCors(NextResponse.redirect(handoff, 307), origin)
    }
    return withCors(NextResponse.redirect(new URL(requestPath, CANONICAL_ORIGIN), 308), origin)
  }

  const existing = req.cookies.get(SESSION_COOKIE)?.value
  const localHostname = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1"
  // 生产 Nginx 也可能把上游地址解析成 localhost；公网 HTTPS 必须优先于主机名。
  const local = localHostname && !https
  if (local && existing === LOCAL_SESSION_ID) return withCors(NextResponse.next(), origin)
  if (!local && isSessionId(existing) && existing !== LOCAL_SESSION_ID) {
    return withCors(NextResponse.next(), origin)
  }

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
  return withCors(response, origin)
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|sitemap.xml).*)"],
}

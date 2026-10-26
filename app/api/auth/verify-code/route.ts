import { NextResponse } from "next/server"

import { errorResponse, ok } from "@/lib/api"
import { getDbForRequest } from "@/lib/assets/store"
import { AUTH_COOKIE } from "@/lib/auth/request"
import {
  claimAnonymousProjects,
  createAccessToken,
  verifyLoginCode,
} from "@/lib/auth/service"
import { ownerFromRequest } from "@/lib/session"

export const runtime = "nodejs"

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)
    const db = getDbForRequest()
    const isApp = body?.client === "app"
      || req.headers.get("x-chengju-client") === "app"
    const session = verifyLoginCode(
      db,
      String(body?.phone ?? ""),
      String(body?.code ?? ""),
      {
        secret: process.env.AUTH_SECRET,
        client: isApp ? "app" : "web",
        deviceName: String(body?.deviceName ?? req.headers.get("x-chengju-device") ?? ""),
        userAgent: req.headers.get("user-agent") ?? "",
      },
    )
    const claimed = claimAnonymousProjects(db, ownerFromRequest(req), session.user.id)
    const access = isApp
      ? createAccessToken(session.token, session.user, { secret: process.env.AUTH_SECRET })
      : null
    const response = NextResponse.json(ok({
      user: session.user,
      expiresAt: session.expiresAt,
      claimed,
      ...(access ? {
        accessToken: access.token,
        accessExpiresAt: access.expiresAt,
        refreshToken: session.token,
      } : {}),
    }))
    response.cookies.set(AUTH_COOKIE, session.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production" || process.env.AUTH_COOKIE_SECURE === "1",
      sameSite: "lax",
      path: "/",
      maxAge: 30 * 24 * 60 * 60,
    })
    return response
  } catch (error) {
    const { body, status } = errorResponse(error)
    return NextResponse.json(body, { status })
  }
}

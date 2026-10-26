import { NextResponse } from "next/server"

import { errorResponse, ok } from "@/lib/api"
import { getDbForRequest } from "@/lib/assets/store"
import { AUTH_COOKIE } from "@/lib/auth/request"
import { claimAnonymousProjects, verifyLoginCode } from "@/lib/auth/service"
import { ownerFromRequest } from "@/lib/session"

export const runtime = "nodejs"

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)
    const db = getDbForRequest()
    const session = verifyLoginCode(
      db,
      String(body?.phone ?? ""),
      String(body?.code ?? ""),
      { secret: process.env.AUTH_SECRET },
    )
    const claimed = claimAnonymousProjects(db, ownerFromRequest(req), session.user.id)
    const isApp = body?.client === "app"
      || req.headers.get("x-chengju-client") === "app"
    const response = NextResponse.json(ok({
      user: session.user,
      expiresAt: session.expiresAt,
      claimed,
      ...(isApp ? { accessToken: session.token } : {}),
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

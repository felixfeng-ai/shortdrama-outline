import { NextResponse } from "next/server"

import { errorResponse, ok } from "@/lib/api"
import { getDbForRequest } from "@/lib/assets/store"
import { AUTH_COOKIE, currentAuthUser, currentSessionId } from "@/lib/auth/request"
import { AuthError, listUserSessions, revokeUserSession } from "@/lib/auth/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  try {
    const db = getDbForRequest()
    const user = currentAuthUser(db, req)
    if (!user) throw new AuthError("请先登录", 401)
    return NextResponse.json(ok({
      sessions: listUserSessions(db, user.id, currentSessionId(req)),
    }))
  } catch (error) {
    const { body, status } = errorResponse(error)
    return NextResponse.json(body, { status })
  }
}

export async function DELETE(req: Request) {
  try {
    const db = getDbForRequest()
    const user = currentAuthUser(db, req)
    if (!user) throw new AuthError("请先登录", 401)
    const body = await req.json().catch(() => null)
    const sessionId = String(body?.sessionId ?? "").trim()
    const current = currentSessionId(req)
    if (!revokeUserSession(db, user.id, sessionId)) {
      throw new AuthError("设备会话不存在或已退出", 404)
    }
    const response = NextResponse.json(ok({ revoked: true }))
    if (sessionId === current) {
      response.cookies.set(AUTH_COOKIE, "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production" || process.env.AUTH_COOKIE_SECURE === "1",
        sameSite: "lax",
        path: "/",
        maxAge: 0,
      })
    }
    return response
  } catch (error) {
    const { body, status } = errorResponse(error)
    return NextResponse.json(body, { status })
  }
}

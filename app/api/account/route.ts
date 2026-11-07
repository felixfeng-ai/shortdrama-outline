import { NextResponse } from "next/server"

import { errorResponse, InputError, ok } from "@/lib/api"
import { getDbForRequest } from "@/lib/assets/store"
import { AUTH_COOKIE, currentAuthUser } from "@/lib/auth/request"
import { AuthError, setAuthUsername } from "@/lib/auth/service"
import { deleteAccountData } from "@/lib/account/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function PATCH(req: Request) {
  try {
    const body = await req.json().catch(() => null)
    const db = getDbForRequest()
    const user = currentAuthUser(db, req)
    if (!user) throw new AuthError("请先登录", 401)
    const updated = setAuthUsername(db, user.id, body?.username)
    return NextResponse.json(ok({ user: updated }))
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

export async function DELETE(req: Request) {
  try {
    const body = await req.json().catch(() => null)
    if (body?.confirm !== "DELETE") throw new InputError("请输入 DELETE 确认注销账号")
    const db = getDbForRequest()
    const user = currentAuthUser(db, req)
    if (!user) throw new AuthError("请先登录", 401)
    const result = deleteAccountData(db, user.id)
    const response = NextResponse.json(ok(result))
    response.cookies.set(AUTH_COOKIE, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production" || process.env.AUTH_COOKIE_SECURE === "1",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    })
    return response
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

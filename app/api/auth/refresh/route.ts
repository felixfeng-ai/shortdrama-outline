import { NextResponse } from "next/server"

import { errorResponse, ok } from "@/lib/api"
import { getDbForRequest } from "@/lib/assets/store"
import { AuthError, refreshAccessToken } from "@/lib/auth/service"

export const runtime = "nodejs"

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)
    const authorization = req.headers.get("authorization")?.trim() ?? ""
    const bearer = authorization.toLowerCase().startsWith("bearer ")
      ? authorization.slice(7).trim()
      : ""
    const refreshToken = String(body?.refreshToken ?? bearer ?? "").trim()
    const result = refreshAccessToken(getDbForRequest(), refreshToken, {
      secret: process.env.AUTH_SECRET,
    })
    if (!result) throw new AuthError("登录已过期，请重新登录", 401)
    return NextResponse.json(ok({
      user: result.user,
      accessToken: result.access.token,
      accessExpiresAt: result.access.expiresAt,
    }))
  } catch (error) {
    const { body, status } = errorResponse(error)
    return NextResponse.json(body, { status })
  }
}

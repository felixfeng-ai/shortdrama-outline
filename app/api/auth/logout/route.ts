import { NextResponse } from "next/server"

import { ok } from "@/lib/api"
import { getDbForRequest } from "@/lib/assets/store"
import { AUTH_COOKIE, authTokenFromRequest } from "@/lib/auth/request"
import { revokeSessionForToken } from "@/lib/auth/service"

export const runtime = "nodejs"

export async function POST(req: Request) {
  const token = authTokenFromRequest(req)
  const revoked = token ? revokeSessionForToken(getDbForRequest(), token) : false
  const response = NextResponse.json(ok({ revoked }))
  response.cookies.set(AUTH_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" || process.env.AUTH_COOKIE_SECURE === "1",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  })
  return response
}

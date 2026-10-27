import { NextResponse } from "next/server"

import { errorResponse, ok } from "@/lib/api"
import { getDbForRequest } from "@/lib/assets/store"
import { emailAuthConfigured, sendLoginCodeEmail } from "@/lib/auth/email"
import { enforceVerificationRateLimits } from "@/lib/auth/rate-limit"
import {
  AuthError,
  discardEmailLoginCode,
  normalizeEmail,
  requestEmailLoginCode,
} from "@/lib/auth/service"

export const runtime = "nodejs"

function devAuthAllowed(req: Request): boolean {
  const host = new URL(req.url).hostname
  return process.env.AUTH_ALLOW_DEV_CODE === "1"
    && (host === "localhost" || host === "127.0.0.1")
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)
    const email = normalizeEmail(body?.email)
    const dev = devAuthAllowed(req)
    if (!dev && !emailAuthConfigured()) {
      throw new AuthError("邮箱登录通道尚未配置，请联系管理员", 503)
    }

    const db = getDbForRequest()
    enforceVerificationRateLimits(db, req)
    const result = requestEmailLoginCode(db, email, {
      secret: process.env.AUTH_SECRET,
      dev,
    })
    if (!dev) {
      try {
        await sendLoginCodeEmail(email, result.code)
      } catch (error) {
        discardEmailLoginCode(db, result.id)
        throw error
      }
    }
    return NextResponse.json(ok({
      expiresAt: result.expiresAt,
      cooldownSeconds: result.cooldownSeconds,
      ...(dev ? { devCode: result.devCode } : {}),
    }))
  } catch (error) {
    const { body, status } = errorResponse(error)
    return NextResponse.json(body, { status })
  }
}

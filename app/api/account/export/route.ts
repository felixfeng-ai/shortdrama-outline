import { NextResponse } from "next/server"

import { errorResponse, ok } from "@/lib/api"
import { getDbForRequest } from "@/lib/assets/store"
import { currentAuthUser } from "@/lib/auth/request"
import { AuthError } from "@/lib/auth/service"
import { buildAccountExport } from "@/lib/account/service"
import { resolveRequestIdentity } from "@/lib/auth/request"
import { enforceApiRateLimit } from "@/lib/security/api-rate-limit"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  try {
    const db = getDbForRequest()
    const user = currentAuthUser(db, req)
    if (!user) throw new AuthError("请先登录", 401)
    enforceApiRateLimit(db, req, "export", {
      identity: resolveRequestIdentity(db, req),
    })
    return NextResponse.json(ok(buildAccountExport(db, user.id)))
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

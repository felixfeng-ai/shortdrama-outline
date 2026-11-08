import { NextResponse } from "next/server"

import { ApiRequestError, errorResponse, ok } from "@/lib/api"
import { getDbForRequest } from "@/lib/assets/store"
import { resolveProjectOwner } from "@/lib/auth/request"
import { isUnlimitedQuotaIdentity } from "@/lib/auth/unlimited"
import { readProductionMetrics } from "@/lib/analytics/production-metrics"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  try {
    const db = getDbForRequest()
    const identity = resolveProjectOwner(db, req)
    if (!isUnlimitedQuotaIdentity(db, identity)) {
      throw new ApiRequestError("无权查看产品指标", 403)
    }
    return NextResponse.json(ok(readProductionMetrics(db)))
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

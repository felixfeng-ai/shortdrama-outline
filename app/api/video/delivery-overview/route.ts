import { NextResponse } from "next/server"

import { errorResponse, ok } from "@/lib/api"
import { claimLegacyProjects } from "@/lib/assets/repo"
import { getDbForRequest } from "@/lib/assets/store"
import { resolveProjectOwner } from "@/lib/auth/request"
import { getDeliveryOverview } from "@/lib/delivery/overview"
import { scheduleDeliveryPackageQueue } from "@/lib/delivery/queue"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  try {
    const db = getDbForRequest()
    const ownerId = resolveProjectOwner(db, req)
    const url = new URL(req.url)
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1"
    if (local || process.env.CHENGJU_CLAIM_LEGACY_PROJECTS === "1") {
      claimLegacyProjects(db, ownerId)
    }
    scheduleDeliveryPackageQueue(db)
    return NextResponse.json(ok({
      overview: getDeliveryOverview(db, ownerId),
    }), {
      headers: { "cache-control": "no-store" },
    })
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

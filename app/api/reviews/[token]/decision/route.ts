import { NextResponse } from "next/server"

import { errorResponse, ok } from "@/lib/api"
import { getDbForRequest } from "@/lib/assets/store"
import { submitDeliveryReview } from "@/lib/delivery/review"
import { enforceApiRateLimit } from "@/lib/security/api-rate-limit"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(
  req: Request,
  context: { params: Promise<{ token: string }> },
) {
  try {
    const params = await context.params
    const db = getDbForRequest()
    enforceApiRateLimit(db, req, "export", { identity: `review:${params.token}` })
    const body = await req.json().catch(() => null)
    return NextResponse.json(ok({
      decision: submitDeliveryReview(db, {
        token: params.token,
        decision: body?.decision === "approved" ? "approved" : "changes_requested",
        note: String(body?.note ?? ""),
      }),
    }), { status: 201 })
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

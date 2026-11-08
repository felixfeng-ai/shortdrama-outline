import { NextResponse } from "next/server"

import { errorResponse, ok } from "@/lib/api"
import { getDbForRequest } from "@/lib/assets/store"
import { addDeliveryReviewFeedback } from "@/lib/delivery/review"
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
      feedback: addDeliveryReviewFeedback(db, {
        token: params.token,
        itemId: String(body?.itemId ?? ""),
        timestampMs: Number(body?.timestampMs) || 0,
        body: String(body?.body ?? ""),
      }),
    }), { status: 201 })
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

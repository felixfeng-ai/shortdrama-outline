import { NextResponse } from "next/server"

import { InputError, errorResponse, ok } from "@/lib/api"
import { getDbForRequest } from "@/lib/assets/store"
import { episodeFileCode } from "@/lib/delivery/dto"
import { deliveryPlatformProfile } from "@/lib/delivery/platforms"
import { resolveDeliveryReviewToken } from "@/lib/delivery/review"
import { enforceApiRateLimit } from "@/lib/security/api-rate-limit"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(
  req: Request,
  context: { params: Promise<{ token: string }> },
) {
  try {
    const params = await context.params
    const db = getDbForRequest()
    enforceApiRateLimit(db, req, "export", { identity: `review:${params.token}` })
    const review = resolveDeliveryReviewToken(db, params.token)
    if (!review) throw new InputError("审片链接无效或已过期")
    const base = `/api/reviews/${encodeURIComponent(params.token)}`
    return NextResponse.json(ok({
      package: {
        id: review.package.id,
        title: review.package.title,
        scope: review.package.scope,
        platform: review.package.platform,
        platformProfile: deliveryPlatformProfile(review.package.platform),
        reviewStatus: review.package.reviewStatus,
      },
      reviewer: {
        name: review.link.reviewerName,
        roleLabel: review.link.roleLabel,
        expiresAt: review.link.expiresAt,
      },
      items: review.items.map((item) => ({
        id: item.id,
        episode: item.episode,
        episodeCode: episodeFileCode(item.episode),
        metadata: JSON.parse(item.metadataJson || "{}"),
        publishVideoUrl: `${base}/file?itemId=${encodeURIComponent(item.id)}&kind=publish`,
        cleanVideoUrl: `${base}/file?itemId=${encodeURIComponent(item.id)}&kind=clean`,
        srtUrl: `${base}/file?itemId=${encodeURIComponent(item.id)}&kind=srt`,
        coverUrl: `${base}/file?itemId=${encodeURIComponent(item.id)}&kind=cover`,
      })),
      feedback: review.feedback,
      decisions: review.decisions,
    }), { headers: { "cache-control": "no-store" } })
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

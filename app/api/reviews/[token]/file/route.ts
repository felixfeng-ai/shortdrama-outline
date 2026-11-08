import { NextResponse } from "next/server"

import { InputError, errorResponse } from "@/lib/api"
import { getDbForRequest } from "@/lib/assets/store"
import {
  readDeliveryArtifact,
  type DeliveryArtifactKind,
} from "@/lib/delivery/files"
import { resolveDeliveryReviewToken } from "@/lib/delivery/review"
import { enforceApiRateLimit } from "@/lib/security/api-rate-limit"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function kind(value: string | null): DeliveryArtifactKind {
  return value === "clean" || value === "srt" || value === "cover" || value === "publish"
    ? value
    : "publish"
}

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
    const url = new URL(req.url)
    const artifact = readDeliveryArtifact(
      db,
      review.package.id,
      kind(url.searchParams.get("kind")),
      url.searchParams.get("itemId")?.trim() || undefined,
    )
    if (!artifact) throw new InputError("审片文件不存在或尚未完成")
    const body = artifact.bytes.buffer.slice(
      artifact.bytes.byteOffset,
      artifact.bytes.byteOffset + artifact.bytes.byteLength,
    ) as ArrayBuffer
    return new NextResponse(body, {
      headers: {
        "Content-Type": artifact.mime,
        "Content-Length": String(artifact.bytes.length),
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(artifact.filename)}`,
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
        "X-Robots-Tag": "noindex, nofollow",
      },
    })
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

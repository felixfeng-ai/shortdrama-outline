import { NextResponse } from "next/server"

import { InputError, errorResponse, ok } from "@/lib/api"
import { assertProjectAccess } from "@/lib/assets/access"
import { getDbForRequest } from "@/lib/assets/store"
import { resolveProjectOwner, resolveRequestIdentity } from "@/lib/auth/request"
import { deliveryPackageDto } from "@/lib/delivery/dto"
import { scheduleDeliveryPackageQueue } from "@/lib/delivery/queue"
import {
  createDeliveryPackage,
  listDeliveryPackages,
} from "@/lib/delivery/repo"
import { enforceApiRateLimit } from "@/lib/security/api-rate-limit"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function requiredString(value: unknown, message: string): string {
  const text = typeof value === "string" ? value.trim() : ""
  if (!text) throw new InputError(message)
  return text
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const projectId = requiredString(url.searchParams.get("projectId"), "缺少 projectId")
    const db = getDbForRequest()
    assertProjectAccess(db, projectId, resolveProjectOwner(db, req))
    scheduleDeliveryPackageQueue(db)
    return NextResponse.json(ok({
      packages: listDeliveryPackages(db, projectId).map((pkg) =>
        deliveryPackageDto(db, pkg, { includePublish: true })
      ),
    }), { headers: { "cache-control": "no-store" } })
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

export async function POST(req: Request) {
  try {
    const db = getDbForRequest()
    const ownerId = resolveProjectOwner(db, req)
    const identity = resolveRequestIdentity(db, req)
    enforceApiRateLimit(db, req, "export", { identity })
    const body = await req.json().catch(() => null)
    const projectId = requiredString(body?.projectId, "缺少 projectId")
    assertProjectAccess(db, projectId, ownerId)
    const items = Array.isArray(body?.items)
      ? body.items.map((item: unknown) => {
        const value = item as Record<string, unknown>
        return {
          episode: Math.max(1, Math.floor(Number(value?.episode) || 1)),
          renderId: requiredString(value?.renderId, "交付项缺少 renderId"),
        }
      })
      : []
    const pkg = createDeliveryPackage(db, {
      projectId,
      title: requiredString(body?.title, "缺少交付包名称"),
      scope: body?.scope === "series" ? "series" : "episode",
      platform: requiredString(body?.platform, "缺少发布平台"),
      subtitleMode: body?.subtitleMode === "sidecar" || body?.subtitleMode === "burned"
        ? body.subtitleMode
        : "both",
      items,
      idempotencyKey: typeof body?.idempotencyKey === "string" ? body.idempotencyKey : undefined,
    })
    scheduleDeliveryPackageQueue(db)
    return NextResponse.json(ok({
      package: deliveryPackageDto(db, pkg, { includePublish: true }),
    }), {
      status: 202,
      headers: { "cache-control": "no-store" },
    })
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

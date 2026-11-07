// 非破坏式扩容：只登记缺失集和来源目标，已有分集由调用方继续沿用稳定 ID。
import { NextResponse } from "next/server"

import { errorResponse, InputError, ok } from "@/lib/api"
import { assertProjectAccess } from "@/lib/assets/access"
import { getDbForRequest } from "@/lib/assets/store"
import { resolveProjectOwner } from "@/lib/auth/request"
import { isProductionMode } from "@/lib/production/presets"
import { extendProductionPlan } from "@/lib/production/repo"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const body = await req.json().catch(() => null)
    if (!isProductionMode(body?.mode)) {
      throw new InputError("请选择要晋级的生产模式")
    }
    if (!Array.isArray(body?.existingEpisodeNumbers)) {
      throw new InputError("缺少已有分集范围")
    }

    const db = getDbForRequest()
    const ownerId = resolveProjectOwner(db, req)
    assertProjectAccess(db, id, ownerId)
    const result = extendProductionPlan(db, id, {
      mode: body.mode,
      targetEpisodes: body?.targetEpisodes,
      existingEpisodeNumbers: body.existingEpisodeNumbers.map(Number),
      estimatedUnits: Number(body?.estimatedUnits) || 0,
    })
    return NextResponse.json(ok(result))
  } catch (error) {
    const { body, status } = errorResponse(error)
    return NextResponse.json(body, { status })
  }
}

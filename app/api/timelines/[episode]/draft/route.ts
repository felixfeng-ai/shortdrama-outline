import { NextResponse } from "next/server"

import { InputError, errorResponse, ok } from "@/lib/api"
import { assertProjectAccess } from "@/lib/assets/access"
import { getDbForRequest } from "@/lib/assets/store"
import { resolveProjectOwner } from "@/lib/auth/request"
import { saveTimelineDraft } from "@/lib/timeline/repo"
import type { TimelinePayload } from "@/lib/timeline/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteContext = { params: { episode: string } | Promise<{ episode: string }> }

function requiredString(value: unknown, message: string): string {
  const text = typeof value === "string" ? value.trim() : ""
  if (!text) throw new InputError(message)
  return text
}

function integer(value: unknown, message: string): number {
  const number = Number(value)
  if (!Number.isInteger(number)) throw new InputError(message)
  return number
}

export async function PUT(req: Request, context: RouteContext) {
  try {
    const body = await req.json().catch(() => null)
    const projectId = requiredString(body?.projectId, "缺少 projectId")
    const params = await context.params
    const episode = integer(params.episode, "集号不正确")
    if (episode < 0 || episode > 9999) throw new InputError("集号不正确")
    const expectedRevision = integer(body?.expectedRevision, "缺少时间线 revision")
    if (!body?.payload || typeof body.payload !== "object") {
      throw new InputError("缺少时间线草稿")
    }
    const db = getDbForRequest()
    assertProjectAccess(db, projectId, resolveProjectOwner(db, req))
    return NextResponse.json(ok({
      draft: saveTimelineDraft(
        db,
        projectId,
        episode,
        expectedRevision,
        body.payload as TimelinePayload,
      ),
    }), { headers: { "cache-control": "no-store" } })
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

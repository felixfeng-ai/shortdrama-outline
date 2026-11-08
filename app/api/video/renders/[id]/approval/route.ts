import { NextResponse } from "next/server"

import { InputError, errorResponse, ok } from "@/lib/api"
import { assertProjectAccess } from "@/lib/assets/access"
import { getDbForRequest } from "@/lib/assets/store"
import { currentAuthUser, resolveProjectOwner } from "@/lib/auth/request"
import {
  getRenderApproval,
  updateRenderApproval,
} from "@/lib/video/render-approvals"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteContext = { params: { id: string } | Promise<{ id: string }> }

function requiredString(value: unknown, message: string): string {
  const text = typeof value === "string" ? value.trim() : ""
  if (!text) throw new InputError(message)
  return text
}

function reviewerLabel(req: Request, db: ReturnType<typeof getDbForRequest>, ownerId: string): string {
  const user = currentAuthUser(db, req)
  if (user?.displayName) return user.displayName.slice(0, 60)
  return ownerId === "local" ? "本地管理员" : `审核人 ${ownerId.slice(-6)}`
}

export async function GET(req: Request, context: RouteContext) {
  try {
    const url = new URL(req.url)
    const projectId = requiredString(url.searchParams.get("projectId"), "缺少 projectId")
    const params = await context.params
    const db = getDbForRequest()
    const ownerId = resolveProjectOwner(db, req)
    assertProjectAccess(db, projectId, ownerId)
    return NextResponse.json(ok({
      approval: getRenderApproval(db, projectId, params.id),
    }))
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

export async function POST(req: Request, context: RouteContext) {
  try {
    const body = await req.json().catch(() => null)
    const projectId = requiredString(body?.projectId, "缺少 projectId")
    const action = body?.action === "approve"
      ? "approve"
      : body?.action === "request_changes"
        ? "request_changes"
        : "request"
    const params = await context.params
    const db = getDbForRequest()
    const ownerId = resolveProjectOwner(db, req)
    assertProjectAccess(db, projectId, ownerId)
    return NextResponse.json(ok({
      approval: updateRenderApproval(db, {
        projectId,
        renderId: params.id,
        action,
        note: typeof body?.note === "string" ? body.note : "",
        reviewerLabel: reviewerLabel(req, db, ownerId),
      }),
    }))
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

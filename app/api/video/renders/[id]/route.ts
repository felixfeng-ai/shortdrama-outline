import { NextResponse } from "next/server"

import { InputError, errorResponse, ok } from "@/lib/api"
import { assertProjectAccess } from "@/lib/assets/access"
import { getDbForRequest } from "@/lib/assets/store"
import { resolveProjectOwner } from "@/lib/auth/request"
import { toVideoRenderDto } from "@/lib/video/render-dto"
import { scheduleVideoRenderQueue } from "@/lib/video/render-queue"
import { getVideoRender } from "@/lib/video/render-repo"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteContext = { params: { id: string } | Promise<{ id: string }> }

export async function GET(req: Request, context: RouteContext) {
  try {
    const url = new URL(req.url)
    const projectId = url.searchParams.get("projectId")?.trim() ?? ""
    if (!projectId) throw new InputError("缺少 projectId")
    const params = await context.params
    const db = getDbForRequest()
    assertProjectAccess(db, projectId, resolveProjectOwner(db, req))
    const render = getVideoRender(db, projectId, params.id)
    if (!render) throw new InputError("渲染任务不存在或无权访问")
    scheduleVideoRenderQueue(db)
    return NextResponse.json(ok({ render: toVideoRenderDto(render) }), {
      headers: { "cache-control": "no-store" },
    })
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

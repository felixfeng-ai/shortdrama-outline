import { NextResponse } from "next/server"

import { InputError, errorResponse, ok } from "@/lib/api"
import { assertProjectAccess } from "@/lib/assets/access"
import { getDbForRequest } from "@/lib/assets/store"
import { resolveProjectOwner, resolveRequestIdentity } from "@/lib/auth/request"
import {
  cancelImageBatch,
  getImageBatchState,
  pauseImageBatch,
  resumeImageBatch,
  retryFailedImageBatch,
  retryFailedImageTask,
  setImageBatchPriority,
} from "@/lib/generation/image-batch"
import { ensureImageQueueWorker } from "@/lib/generation/image-queue"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function projectIdFromRequest(req: Request, body?: Record<string, unknown> | null): string {
  const value = typeof body?.projectId === "string"
    ? body.projectId.trim()
    : new URL(req.url).searchParams.get("projectId")?.trim() ?? ""
  if (!value) throw new InputError("缺少 projectId")
  return value
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ batchId: string }> },
) {
  try {
    const db = getDbForRequest()
    const { batchId } = await ctx.params
    const projectId = projectIdFromRequest(req)
    assertProjectAccess(db, projectId, resolveProjectOwner(db, req))
    ensureImageQueueWorker(db)
    return NextResponse.json(ok(getImageBatchState(db, batchId, projectId)))
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ batchId: string }> },
) {
  try {
    const db = getDbForRequest()
    const { batchId } = await ctx.params
    const body = await req.json().catch(() => null) as Record<string, unknown> | null
    const projectId = projectIdFromRequest(req, body)
    assertProjectAccess(db, projectId, resolveProjectOwner(db, req))
    const action = typeof body?.action === "string" ? body.action : "pause"
    let state
    if (action === "pause") state = pauseImageBatch(db, batchId, projectId)
    else if (action === "resume") state = resumeImageBatch(db, batchId, projectId)
    else if (action === "cancel") state = cancelImageBatch(db, batchId, projectId)
    else if (action === "retry-failed") {
      state = retryFailedImageBatch(
        db,
        batchId,
        resolveRequestIdentity(db, req),
        projectId,
      )
    } else if (action === "retry-task") {
      state = retryFailedImageTask(
        db,
        batchId,
        resolveRequestIdentity(db, req),
        String(body?.targetKey ?? ""),
        projectId,
      )
    } else if (action === "priority") {
      state = setImageBatchPriority(db, batchId, Number(body?.priority ?? 0), projectId)
    } else {
      throw new InputError("不支持的批次操作")
    }
    if (action === "resume" || action === "retry-failed" || action === "retry-task") {
      ensureImageQueueWorker(db)
    }
    return NextResponse.json(ok(state))
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

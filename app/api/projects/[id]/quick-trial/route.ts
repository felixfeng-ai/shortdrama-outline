// 快速试片断点：只保存流程位置和视觉费用授权，不复制任何正式创作产物。
import { NextResponse } from "next/server"

import { errorResponse, InputError, ok } from "@/lib/api"
import { assertProjectAccess } from "@/lib/assets/access"
import { getDbForRequest } from "@/lib/assets/store"
import { resolveProjectOwner } from "@/lib/auth/request"
import {
  getQuickTrialRun,
  updateQuickTrialRun,
  upsertQuickTrialRun,
} from "@/lib/production/quick-trial-repo"
import {
  isQuickTrialPhase,
  isQuickTrialRunStatus,
} from "@/lib/production/quick-trial"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const db = getDbForRequest()
    const ownerId = resolveProjectOwner(db, req)
    assertProjectAccess(db, id, ownerId)
    return NextResponse.json(ok({ run: getQuickTrialRun(db, id) }))
  } catch (error) {
    const { body, status } = errorResponse(error)
    return NextResponse.json(body, { status })
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const body = await req.json().catch(() => null)
    const idea = typeof body?.idea === "string" ? body.idea.trim() : ""
    if (idea.length < 6) throw new InputError("故事想法太短，无法建立快速试片")

    const db = getDbForRequest()
    const ownerId = resolveProjectOwner(db, req)
    assertProjectAccess(db, id, ownerId)
    const run = upsertQuickTrialRun(db, {
      projectId: id,
      idea,
      phase: "start",
      status: "active",
      error: null,
      visualApproved: false,
    })
    return NextResponse.json(ok({ run }))
  } catch (error) {
    const { body, status } = errorResponse(error)
    return NextResponse.json(body, { status })
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const body = await req.json().catch(() => null)
    if (body?.phase !== undefined && !isQuickTrialPhase(body.phase)) {
      throw new InputError("快速试片阶段无效")
    }
    if (body?.status !== undefined && !isQuickTrialRunStatus(body.status)) {
      throw new InputError("快速试片状态无效")
    }
    if (body?.error !== undefined && body.error !== null && typeof body.error !== "string") {
      throw new InputError("快速试片错误信息无效")
    }
    if (body?.visualApproved !== undefined && typeof body.visualApproved !== "boolean") {
      throw new InputError("视觉费用确认状态无效")
    }

    const db = getDbForRequest()
    const ownerId = resolveProjectOwner(db, req)
    assertProjectAccess(db, id, ownerId)
    const run = updateQuickTrialRun(db, id, {
      phase: body?.phase,
      status: body?.status,
      error: body?.error,
      visualApproved: body?.visualApproved,
    })
    if (!run) throw new InputError("请先开始快速试片")
    return NextResponse.json(ok({ run }))
  } catch (error) {
    const { body, status } = errorResponse(error)
    return NextResponse.json(body, { status })
  }
}

// 快速试片断点：只保存流程位置和视觉费用授权，不复制任何正式创作产物。
import { NextResponse } from "next/server"

import { errorResponse, InputError, ok } from "@/lib/api"
import { assertProjectAccess } from "@/lib/assets/access"
import { getDbForRequest } from "@/lib/assets/store"
import { resolveProjectOwner, resolveRequestIdentity } from "@/lib/auth/request"
import { getQuota, QuotaError } from "@/lib/quota"
import { getQuickCreationQuotes } from "@/lib/production/quick-creation-server"
import {
  getQuickTrialRun,
  updateQuickTrialRun,
  upsertQuickTrialRun,
} from "@/lib/production/quick-trial-repo"
import {
  isQuickCreationTarget,
  isQuickTrialPhase,
  isQuickTrialRunStatus,
  quickCreationTargetIncludesVideo,
  quickCreationTargetIncludesVisuals,
  type QuickCreationTarget,
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
    if (body?.target !== undefined && !isQuickCreationTarget(body.target)) {
      throw new InputError("快速创作范围无效")
    }
    const idea = typeof body?.idea === "string" ? body.idea.trim() : ""
    if (idea.length < 6) throw new InputError("故事想法太短，无法建立快速试片")
    const target = body?.target === undefined ? "keyframe" : body.target
    if (!isQuickCreationTarget(target)) throw new InputError("快速创作范围无效")

    const db = getDbForRequest()
    const ownerId = resolveProjectOwner(db, req)
    assertProjectAccess(db, id, ownerId)
    const quotes = getQuickCreationQuotes()
    const quote = quotes[target]
    if (!quote.available) {
      throw new InputError(quote.unavailableReason || "当前快速创作范围不可用")
    }
    const quota = getQuota(db, resolveRequestIdentity(db, req))
    if (!quota.unlimited && quota.remaining < quote.units) {
      throw new QuotaError(
        `本轮快速创作预计需要 ${quote.units} 额度，当前仅剩 ${quota.remaining}。请减少范围或等待额度恢复。`,
      )
    }
    const run = upsertQuickTrialRun(db, {
      projectId: id,
      idea,
      phase: "start",
      status: "active",
      error: null,
      target,
      budgetUnits: quote.units,
      budgetMicros: quote.totalMicros,
      visualApproved: quickCreationTargetIncludesVisuals(target),
      videoApproved: quickCreationTargetIncludesVideo(target),
      videoBudgetMicros: quote.videoCostMicros,
      videoModel: quote.video?.model ?? null,
      videoResolution: quote.video?.resolution ?? null,
      videoDurationSeconds: quote.video?.durationSeconds ?? 5,
    })
    return NextResponse.json(ok({ run, quote }))
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
    if (body?.target !== undefined && !isQuickCreationTarget(body.target)) {
      throw new InputError("快速创作范围无效")
    }
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
    if (body?.videoApproved !== undefined && typeof body.videoApproved !== "boolean") {
      throw new InputError("视频费用确认状态无效")
    }

    const db = getDbForRequest()
    const ownerId = resolveProjectOwner(db, req)
    assertProjectAccess(db, id, ownerId)
    let upgradedRun: {
      target: QuickCreationTarget
      budgetUnits: number
      budgetMicros: number
      visualApproved: boolean
      videoApproved: boolean
      videoBudgetMicros: number
      videoModel: string | null
      videoResolution: string | null
      videoDurationSeconds: number
    } | null = null
    if (body?.target !== undefined) {
      const nextTarget = body.target
      if (!isQuickCreationTarget(nextTarget)) throw new InputError("快速创作范围无效")
      const quotes = getQuickCreationQuotes()
      const quote = quotes[nextTarget]
      if (!quote.available) {
        throw new InputError(quote.unavailableReason || "当前快速创作范围不可用")
      }
      const quota = getQuota(db, resolveRequestIdentity(db, req))
      if (!quota.unlimited && quota.remaining < quote.units) {
        throw new QuotaError(
          `本轮快速创作预计需要 ${quote.units} 额度，当前仅剩 ${quota.remaining}。请减少范围或等待额度恢复。`,
        )
      }
      upgradedRun = {
        target: nextTarget,
        budgetUnits: quote.units,
        budgetMicros: quote.totalMicros,
        visualApproved: quickCreationTargetIncludesVisuals(nextTarget),
        videoApproved: quickCreationTargetIncludesVideo(nextTarget),
        videoBudgetMicros: quote.videoCostMicros,
        videoModel: quote.video?.model ?? null,
        videoResolution: quote.video?.resolution ?? null,
        videoDurationSeconds: quote.video?.durationSeconds ?? 5,
      }
    }
    const run = updateQuickTrialRun(db, id, {
      phase: body?.phase,
      status: body?.status,
      error: body?.error,
      target: upgradedRun?.target,
      budgetUnits: upgradedRun?.budgetUnits,
      budgetMicros: upgradedRun?.budgetMicros,
      visualApproved: body?.visualApproved,
      videoApproved: upgradedRun?.videoApproved ?? body?.videoApproved,
      videoBudgetMicros: upgradedRun?.videoBudgetMicros,
      videoModel: upgradedRun?.videoModel,
      videoResolution: upgradedRun?.videoResolution,
      videoDurationSeconds: upgradedRun?.videoDurationSeconds,
    })
    if (!run) throw new InputError("请先开始快速试片")
    return NextResponse.json(ok({ run }))
  } catch (error) {
    const { body, status } = errorResponse(error)
    return NextResponse.json(body, { status })
  }
}

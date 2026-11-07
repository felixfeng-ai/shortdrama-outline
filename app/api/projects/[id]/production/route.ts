// 项目生产计划：项目类型、样片/小批/整季档位和阶段的事实入口。
import { NextResponse } from "next/server"

import { errorResponse, InputError, ok } from "@/lib/api"
import { assertProjectAccess } from "@/lib/assets/access"
import { getDbForRequest } from "@/lib/assets/store"
import { resolveProjectOwner } from "@/lib/auth/request"
import {
  createProductionPlan,
  getProductionPlan,
  updateProductionPlan,
} from "@/lib/production/repo"
import { isProductionMode } from "@/lib/production/presets"
import {
  isProjectType,
  isProductionStageKey,
  type ProductionPlanStatus,
} from "@/lib/production/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function readPlanStatus(value: unknown): ProductionPlanStatus | undefined {
  return value === "draft"
    || value === "active"
    || value === "blocked"
    || value === "completed"
    ? value
    : undefined
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const db = getDbForRequest()
    const ownerId = resolveProjectOwner(db, req)
    assertProjectAccess(db, id, ownerId)
    return NextResponse.json(ok({ plan: getProductionPlan(db, id) }))
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
    if (!isProjectType(body?.projectType)) {
      throw new InputError("请选择有效的项目类型")
    }
    if (!isProductionMode(body?.mode)) {
      throw new InputError("请选择样片、小批或整季生产模式")
    }

    const db = getDbForRequest()
    const ownerId = resolveProjectOwner(db, req)
    assertProjectAccess(db, id, ownerId)
    const plan = createProductionPlan(db, {
      projectId: id,
      projectType: body.projectType,
      mode: body.mode,
      targetEpisodes: body?.targetEpisodes,
      currentStage: isProductionStageKey(body?.currentStage) ? body.currentStage : undefined,
    })
    return NextResponse.json(ok({ plan }))
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
    if (body?.mode !== undefined && !isProductionMode(body.mode)) {
      throw new InputError("请选择样片、小批或整季生产模式")
    }
    if (body?.currentStage !== undefined && !isProductionStageKey(body.currentStage)) {
      throw new InputError("当前生产阶段无效")
    }

    const db = getDbForRequest()
    const ownerId = resolveProjectOwner(db, req)
    assertProjectAccess(db, id, ownerId)
    const plan = updateProductionPlan(db, id, {
      mode: body?.mode,
      targetEpisodes: body?.targetEpisodes,
      currentStage: body?.currentStage,
      status: readPlanStatus(body?.status),
    })
    if (!plan) throw new InputError("请先创建生产计划")
    return NextResponse.json(ok({ plan }))
  } catch (error) {
    const { body, status } = errorResponse(error)
    return NextResponse.json(body, { status })
  }
}

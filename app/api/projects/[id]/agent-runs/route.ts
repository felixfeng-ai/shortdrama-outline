import { NextResponse } from "next/server"

import { errorResponse, fail, InputError, ok } from "@/lib/api"
import { assertProjectAccess } from "@/lib/assets/access"
import { getDbForRequest } from "@/lib/assets/store"
import { ARTIFACT_KINDS, type ArtifactKind } from "@/lib/assets/types"
import { resolveProjectOwner } from "@/lib/auth/request"
import type { AgentActionKind } from "@/lib/agent/plan"
import {
  applyAgentAction,
  listAgentActionRuns,
  type AgentActionInput,
} from "@/lib/agent/runs"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteContext = { params: { id: string } | Promise<{ id: string }> }

const TARGET_TYPES = ["character", "place", "episode", "shot"] as const
const ACTION_KINDS = ["shot-edit", "entity-edit"] as const
const TARGET_ARTIFACT: Record<AgentActionInput["targetType"], string> = {
  character: "characters",
  place: "visualPlaces",
  episode: "episodes",
  shot: "shots",
}

function readString(value: unknown, label: string): string {
  const text = typeof value === "string" ? value.trim() : ""
  if (!text) throw new InputError(`缺少${label}`)
  if (text.length > 2_000) throw new InputError(`${label}过长`)
  return text
}

function parseAction(body: Record<string, unknown>, projectId: string, ownerId: string): AgentActionInput {
  const actionKind = readString(body.actionKind, "动作类型") as AgentActionKind
  if (!(ACTION_KINDS as readonly string[]).includes(actionKind)) throw new InputError("动作类型不合法")

  const artifactKind = readString(body.artifactKind, "产物类型") as ArtifactKind
  if (!(ARTIFACT_KINDS as readonly string[]).includes(artifactKind)) throw new InputError("产物类型不合法")
  if (artifactKind === "idea") throw new InputError("Agent 文本修改不能写入故事起点")

  const targetType = readString(body.targetType, "目标类型") as AgentActionInput["targetType"]
  if (!(TARGET_TYPES as readonly string[]).includes(targetType)) throw new InputError("目标类型不合法")
  if (actionKind === "shot-edit" && targetType !== "shot") throw new InputError("镜头改写必须指向镜头")
  if (TARGET_ARTIFACT[targetType] !== artifactKind) {
    throw new InputError("目标类型与产物类型不一致")
  }

  const beforePayload = body.beforePayload
  const afterPayload = body.afterPayload
  if (!Array.isArray(beforePayload) || !Array.isArray(afterPayload)) {
    throw new InputError("执行前后内容必须是数组")
  }
  if (JSON.stringify(beforePayload) === JSON.stringify(afterPayload)) {
    throw new InputError("执行前后内容没有变化")
  }
  if (JSON.stringify(beforePayload).length > 2_000_000 || JSON.stringify(afterPayload).length > 2_000_000) {
    throw new InputError("内容过大，无法保存")
  }

  const targetId = readString(body.targetId, "目标 ID")
  const containsTarget = (items: unknown[]) => items.some((item) => {
    if (!item || typeof item !== "object") return false
    const record = item as Record<string, unknown>
    return record.id === targetId || record.entityId === targetId
  })
  if (!containsTarget(beforePayload) || !containsTarget(afterPayload)) {
    throw new InputError("执行内容中没有找到目标实体")
  }

  return {
    projectId,
    ownerId,
    actionKind,
    artifactKind,
    targetType,
    targetId,
    targetLabel: readString(body.targetLabel, "目标名称"),
    field: readString(body.field, "字段"),
    summary: readString(body.summary, "执行摘要"),
    beforePayload,
    afterPayload,
  }
}

export async function GET(req: Request, context: RouteContext) {
  try {
    const db = getDbForRequest()
    const ownerId = resolveProjectOwner(db, req)
    const params = await context.params
    assertProjectAccess(db, params.id, ownerId)
    const limit = Number(new URL(req.url).searchParams.get("limit") || 20)
    return NextResponse.json(ok({
      runs: listAgentActionRuns(db, params.id, Number.isFinite(limit) ? limit : 20),
    }), { headers: { "cache-control": "no-store" } })
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

export async function POST(req: Request, context: RouteContext) {
  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new InputError("请求内容不合法")
    const db = getDbForRequest()
    const ownerId = resolveProjectOwner(db, req)
    const params = await context.params
    assertProjectAccess(db, params.id, ownerId)
    const result = applyAgentAction(
      db,
      parseAction(body as Record<string, unknown>, params.id, ownerId),
    )
    return NextResponse.json(ok({
      run: result.run,
      beforeSnapshot: {
        id: result.beforeSnapshot.id,
        version: result.beforeSnapshot.version,
      },
      afterSnapshot: {
        id: result.afterSnapshot.id,
        version: result.afterSnapshot.version,
      },
    }), { headers: { "cache-control": "no-store" } })
  } catch (error) {
    if (error instanceof InputError) {
      return NextResponse.json(fail(error.message), { status: 400 })
    }
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

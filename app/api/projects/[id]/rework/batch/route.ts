import { NextResponse } from "next/server"

import { errorResponse, InputError, ok } from "@/lib/api"
import { assertProjectAccess } from "@/lib/assets/access"
import { persistEditedArtifact } from "@/lib/assets/persist"
import { latestSnapshot, type ArtifactKind } from "@/lib/assets/repo"
import { getDbForRequest } from "@/lib/assets/store"
import type { Shot, VisualCharacter, VisualPlace } from "@/lib/assets/types"
import { resolveProjectOwner } from "@/lib/auth/request"
import { applyShotRework, type BatchReworkAction } from "@/lib/rework/plan"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function latestArray<T>(db: ReturnType<typeof getDbForRequest>, projectId: string, kind: ArtifactKind): T[] {
  const payload = latestSnapshot(db, projectId, kind)?.payload
  return Array.isArray(payload) ? payload as T[] : []
}

function readShotIds(value: unknown): string[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) throw new InputError("shotIds 必须是数组")
  const ids = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
  if (ids.length > 500) throw new InputError("单次最多返修 500 个镜头")
  return Array.from(new Set(ids))
}

/**
 * 批量确定性返修。
 * 服务端始终读取最新快照和最新视觉锚点，客户端只提交动作与目标 id，
 * 不能自带 Prompt 覆盖正文；有变化时写入新的 shots 快照。
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const body = await req.json().catch(() => null)
    const action = body?.action as BatchReworkAction
    if (action !== "repair-anchors") throw new InputError("不支持的返修动作")

    const db = getDbForRequest()
    const ownerId = resolveProjectOwner(db, req)
    assertProjectAccess(db, id, ownerId)

    const shots = latestArray<Shot>(db, id, "shots")
    if (shots.length === 0) throw new InputError("当前项目还没有分镜，无法返修")
    const visuals = latestArray<VisualCharacter>(db, id, "visualCharacters")
    const places = latestArray<VisualPlace>(db, id, "visualPlaces")
    const result = applyShotRework({
      action,
      shots,
      visuals,
      places,
      shotIds: readShotIds(body?.shotIds),
    })

    if (result.changedIds.length === 0) {
      return NextResponse.json(ok({
        shots: result.shots,
        changedIds: [],
        snapshot: null,
      }))
    }
    const snapshot = persistEditedArtifact(db, id, "shots", result.shots)
    return NextResponse.json(ok({
      shots: result.shots,
      changedIds: result.changedIds,
      snapshot,
    }))
  } catch (error) {
    const { body, status } = errorResponse(error)
    return NextResponse.json(body, { status })
  }
}

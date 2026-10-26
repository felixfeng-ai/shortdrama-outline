// 快照：按 project + kind 列出全部版本（倒序）。
import { NextResponse } from "next/server"
import { errorResponse, ok, InputError } from "@/lib/api"
import { getDbForRequest } from "@/lib/assets/store"
import { listSnapshots } from "@/lib/assets/repo"
import { persistEditedArtifact } from "@/lib/assets/persist"
import { ARTIFACT_KINDS, type ArtifactKind } from "@/lib/assets/types"
import { assertProjectAccess } from "@/lib/assets/access"
import { resolveProjectOwner } from "@/lib/auth/request"

export const runtime = "nodejs"
// 这些路由依赖请求参数与数据库，不能静态预渲染
export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const projectId = url.searchParams.get("projectId") || ""
    const kind = url.searchParams.get("kind") || ""

    if (!projectId) throw new InputError("缺少 projectId")
    if (!(ARTIFACT_KINDS as readonly string[]).includes(kind)) throw new InputError("kind 不合法")

    const db = getDbForRequest()
    assertProjectAccess(db, projectId, resolveProjectOwner(db, req))
    return NextResponse.json(ok({ snapshots: listSnapshots(db, projectId, kind as ArtifactKind) }))
  } catch (error) {
    const { body, status } = errorResponse(error)
    return NextResponse.json(body, { status })
  }
}

/**
 * 手工保存一版产物。
 *
 * 画布内编辑只改一个字段，但它仍然是这个项目的一次真实版本变更：
 * 需要进入 snapshots，并在血缘里指向当时的上游版本。这样刷新能恢复，
 * 影响范围查询也能继续沿链路反查。
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)
    const projectId = typeof body?.projectId === "string" ? body.projectId.trim() : ""
    const kind = typeof body?.kind === "string" ? body.kind : ""
    const payload = body?.payload

    if (!projectId) throw new InputError("缺少 projectId")
    if (!(ARTIFACT_KINDS as readonly string[]).includes(kind)) throw new InputError("kind 不合法")
    if (payload === undefined || payload === null) throw new InputError("缺少要保存的内容")

    const artifactKind = kind as ArtifactKind
    if (artifactKind === "idea") {
      if (Array.isArray(payload) || typeof payload !== "object") throw new InputError("idea 必须是对象")
    } else if (!Array.isArray(payload)) {
      throw new InputError("这一步的内容必须是数组")
    }

    const serialized = JSON.stringify(payload)
    if (serialized.length > 2_000_000) throw new InputError("内容过大，无法保存")

    const db = getDbForRequest()
    assertProjectAccess(db, projectId, resolveProjectOwner(db, req))

    const snapshot = persistEditedArtifact(db, projectId, artifactKind, payload)
    return NextResponse.json(ok({ snapshot }))
  } catch (error) {
    const { body, status } = errorResponse(error)
    return NextResponse.json(body, { status })
  }
}

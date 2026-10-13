// 快照：按 project + kind 列出全部版本（倒序）。
import { NextResponse } from "next/server"
import { errorResponse, ok, InputError } from "@/lib/api"
import { getDbForRequest } from "@/lib/assets/store"
import { listSnapshots, type ArtifactKind } from "@/lib/assets/repo"

export const runtime = "nodejs"
// 这些路由依赖请求参数与数据库，不能静态预渲染
export const dynamic = "force-dynamic"

const KINDS: ArtifactKind[] = [
  "idea", "characters", "acts", "episodes", "visualCharacters", "scenes", "shots",
]

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const projectId = url.searchParams.get("projectId") || ""
    const kind = url.searchParams.get("kind") || ""

    if (!projectId) throw new InputError("缺少 projectId")
    if (!KINDS.includes(kind as ArtifactKind)) throw new InputError("kind 不合法")

    return NextResponse.json(ok({ snapshots: listSnapshots(getDbForRequest(), projectId, kind as ArtifactKind) }))
  } catch (error) {
    const { body, status } = errorResponse(error)
    return NextResponse.json(body, { status })
  }
}

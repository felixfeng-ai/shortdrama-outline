// 导出：自包含项目包（SDD v0.2 E1-E3，原则 P2「账本可带走」）。
//
// 服务端只产出「文本类」清单（project.json / prompts.csv / storyboard.html）；
// 图片由前端从本地图库并入 zip——图永远不上传（原则 P1）。
import { NextResponse } from "next/server"
import { InputError, errorResponse, ok } from "@/lib/api"
import { getDbForRequest } from "@/lib/assets/store"
import { listRefs } from "@/lib/assets/refs"
import { listSnapshots, getProject, type ArtifactKind } from "@/lib/assets/repo"
import type { Shot, VisualCharacter, Scene } from "@/lib/assets/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const KINDS: ArtifactKind[] = ["characters", "acts", "episodes", "visualCharacters", "scenes", "visualPlaces", "shots"]

export async function GET(req: Request) {
  try {
    const projectId = new URL(req.url).searchParams.get("projectId") || ""
    if (!projectId) throw new InputError("缺少 projectId")

    const db = getDbForRequest()
    const project = getProject(db, projectId)
    if (!project) throw new InputError("项目不存在")

    // 每一类取最新一版
    const latest: Record<string, { version: number; payload: unknown }> = {}
    for (const kind of KINDS) {
      const list = listSnapshots(db, projectId, kind)
      if (list[0]) latest[kind] = { version: list[0].version, payload: list[0].payload }
    }

    return NextResponse.json(ok({
      manifest: {
        project,
        latest,
        refs: listRefs(db, projectId),   // 只有元数据，图由前端并入
        exportedAt: Date.now(),
      },
    }))
  } catch (error) {
    const { body, status } = errorResponse(error)
    return NextResponse.json(body, { status })
  }
}


export type { Shot, VisualCharacter, Scene }

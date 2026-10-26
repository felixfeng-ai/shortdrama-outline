// 导出：自包含项目包（SDD v0.2 E1-E3，原则 P2「账本可带走」）。
//
// 服务端只产出「文本类」清单（project.json / prompts.csv / storyboard.html）；
// 图片由前端从本地图库并入 zip——图永远不上传（原则 P1）。
import { NextResponse } from "next/server"
import { InputError, errorResponse, ok } from "@/lib/api"
import { getDbForRequest } from "@/lib/assets/store"
import { listRefs } from "@/lib/assets/refs"
import { listSnapshots } from "@/lib/assets/repo"
import { ARTIFACT_KINDS } from "@/lib/assets/types"
import type { Shot, VisualCharacter, Scene } from "@/lib/assets/types"
import { PROJECT_PACKAGE_SCHEMA, PROJECT_PACKAGE_SCHEMA_VERSION } from "@/lib/assets/export"
import { assertProjectAccess } from "@/lib/assets/access"
import { resolveProjectOwner } from "@/lib/auth/request"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** 导出清单里不含 idea（它是输入，不是产物）；清单本身仍来自唯一来源 */
const KINDS = ARTIFACT_KINDS.filter((k) => k !== "idea")

export async function GET(req: Request) {
  try {
    const projectId = new URL(req.url).searchParams.get("projectId") || ""
    if (!projectId) throw new InputError("缺少 projectId")

    const db = getDbForRequest()
    const project = assertProjectAccess(db, projectId, resolveProjectOwner(db, req))

    // 每一类取最新一版
    const latest: Record<string, { version: number; payload: unknown }> = {}
    for (const kind of KINDS) {
      const list = listSnapshots(db, projectId, kind)
      if (list[0]) latest[kind] = { version: list[0].version, payload: list[0].payload }
    }

    return NextResponse.json(ok({
      manifest: {
        schema: PROJECT_PACKAGE_SCHEMA,
        schemaVersion: PROJECT_PACKAGE_SCHEMA_VERSION,
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

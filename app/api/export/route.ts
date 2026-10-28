// 导出：自包含项目包（SDD v0.2 E1-E3，原则 P2「账本可带走」）。
//
// 服务端只产出「文本类」清单（project.json / prompts.csv / storyboard.html）；
// 图片由前端从本地图库并入 zip——图永远不上传（原则 P1）。
import { NextResponse } from "next/server"
import { InputError, errorResponse, ok } from "@/lib/api"
import { getDbForRequest } from "@/lib/assets/store"
import { listRefs } from "@/lib/assets/refs"
import { listSnapshots } from "@/lib/assets/repo"
import { ARTIFACT_KINDS, type ArtifactKind, type Shot, type VisualCharacter, type Scene } from "@/lib/assets/types"
import { buildProjectPackageManifest } from "@/lib/export/package"
import { assertProjectAccess } from "@/lib/assets/access"
import { resolveProjectOwner, resolveRequestIdentity } from "@/lib/auth/request"
import { EMPTY_BRIEF } from "@/lib/brief"
import { EMPTY_LOOK } from "@/lib/look"
import { listGeneratedAssets, listGenerationTasks } from "@/lib/generation/repo"
import { keyframeManifestEntry } from "@/lib/generation/export"
import { enforceApiRateLimit } from "@/lib/security/api-rate-limit"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const KINDS = ARTIFACT_KINDS

export async function GET(req: Request) {
  try {
    const projectId = new URL(req.url).searchParams.get("projectId") || ""
    if (!projectId) throw new InputError("缺少 projectId")

    const db = getDbForRequest()
    enforceApiRateLimit(db, req, "export", {
      identity: resolveRequestIdentity(db, req),
    })
    const project = assertProjectAccess(db, projectId, resolveProjectOwner(db, req))

    // 每一类取最新一版，同时保留完整快照供备份读取器使用。
    const latest: Record<string, unknown> = {}
    const snapshots: Array<{
      id: string
      kind: ArtifactKind
      version: number
      payload: unknown
      parents: string[]
      createdAt: number
    }> = []
    for (const kind of KINDS) {
      const list = listSnapshots(db, projectId, kind)
      if (list[0]) latest[kind] = list[0].payload
      for (const snapshot of list) {
        snapshots.push({
          id: snapshot.id,
          kind,
          version: snapshot.version,
          payload: snapshot.payload,
          parents: snapshot.parents,
          createdAt: snapshot.createdAt,
        })
      }
    }

    const idea = latest.idea as { idea?: unknown; genre?: unknown } | undefined
    const episodes = Array.isArray(latest.episodes) ? latest.episodes as unknown[] : []
    const manifest = buildProjectPackageManifest({
      project: {
        id: project.id,
        title: project.title,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      },
      mode: "delivery",
      exportedAt: Date.now(),
      projectSettings: {
        genre: typeof idea?.genre === "string" ? idea.genre : "none",
        episodeCount: episodes.length,
        brief: EMPTY_BRIEF,
        look: EMPTY_LOOK,
        judgments: [],
      },
      story: {
        idea: typeof idea?.idea === "string" ? idea.idea : "",
        characters: latest.characters ?? [],
        acts: latest.acts ?? [],
        episodes: latest.episodes ?? [],
      },
      assets: {
        visuals: latest.visualCharacters ?? [],
        scenes: latest.scenes ?? [],
        places: latest.visualPlaces ?? [],
        shots: latest.shots ?? [],
      },
      refs: listRefs(db, projectId),
      keyframes: listGeneratedAssets(db, projectId).map((asset) =>
        keyframeManifestEntry(asset, { archivePath: null, included: false })),
      tasks: listGenerationTasks(db, projectId),
      snapshots,
      files: [],
      warnings: [
        "服务端清单不含本地参考图像素、浏览器本地偏好和图片文件；完整迁移请使用 Web 端“完整备份”。",
      ],
    })

    return NextResponse.json(ok({ manifest }))
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}


export type { Shot, VisualCharacter, Scene }

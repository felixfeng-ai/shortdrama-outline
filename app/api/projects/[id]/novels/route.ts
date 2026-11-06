import { NextResponse } from "next/server"

import { errorResponse, ok } from "@/lib/api"
import { assertProjectAccess } from "@/lib/assets/access"
import { getDbForRequest } from "@/lib/assets/store"
import { resolveProjectOwner } from "@/lib/auth/request"
import { estimateNovelGeneration, readNovelPreset } from "@/lib/novels/presets"
import {
  createNovelEdition,
  listNovelEditions,
} from "@/lib/novels/repo"
import { buildNovelSourcePack } from "@/lib/novels/source-pack"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteContext = { params: { id: string } | Promise<{ id: string }> }

export async function GET(req: Request, context: RouteContext) {
  try {
    const db = getDbForRequest()
    const ownerId = resolveProjectOwner(db, req)
    const { id } = await context.params
    assertProjectAccess(db, id, ownerId)
    const editions = listNovelEditions(db, id, ownerId)
    return NextResponse.json(ok({ editions }), {
      headers: { "cache-control": "no-store" },
    })
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

export async function POST(req: Request, context: RouteContext) {
  try {
    const body = await req.json().catch(() => null)
    const db = getDbForRequest()
    const ownerId = resolveProjectOwner(db, req)
    const { id } = await context.params
    const project = assertProjectAccess(db, id, ownerId)
    const preset = readNovelPreset(body?.preset)
    if (!preset) {
      return NextResponse.json(
        { success: false, data: null, error: "请选择小说篇幅" },
        { status: 400 },
      )
    }
    const source = buildNovelSourcePack(db, id)
    if (source.episodes.length === 0) {
      return NextResponse.json(
        { success: false, data: null, error: "请先在主工作台完成分集剧情" },
        { status: 400 },
      )
    }
    const edition = createNovelEdition(db, {
      projectId: id,
      ownerId,
      title: typeof body?.title === "string" ? body.title : project.title,
      preset: preset.id,
      sourceSnapshotIds: source.sourceSnapshotIds,
      sourceSignature: source.signature,
    })
    return NextResponse.json(ok({
      edition,
      estimate: estimateNovelGeneration(preset, source.episodes.length),
    }), { headers: { "cache-control": "no-store" } })
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

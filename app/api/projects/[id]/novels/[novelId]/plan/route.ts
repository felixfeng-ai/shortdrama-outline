import { NextResponse } from "next/server"

import { errorResponse, ok } from "@/lib/api"
import { assertProjectAccess } from "@/lib/assets/access"
import { getDbForRequest } from "@/lib/assets/store"
import { resolveProjectOwner } from "@/lib/auth/request"
import { assertNovelAccess } from "@/lib/novels/access"
import { planNovel } from "@/lib/novels/planner"
import { estimateNovelGeneration, requireNovelPreset } from "@/lib/novels/presets"
import { getNovelEdition, saveNovelPlan } from "@/lib/novels/repo"
import { buildNovelSourcePack } from "@/lib/novels/source-pack"

export const runtime = "nodejs"

type RouteContext = {
  params: { id: string; novelId: string } | Promise<{ id: string; novelId: string }>
}

export async function POST(req: Request, context: RouteContext) {
  try {
    const body = await req.json().catch(() => null)
    const db = getDbForRequest()
    const ownerId = resolveProjectOwner(db, req)
    const { id, novelId } = await context.params
    assertProjectAccess(db, id, ownerId)
    const edition = assertNovelAccess(db, id, novelId, ownerId)
    const preset = requireNovelPreset(body?.preset ?? edition.preset)
    const source = buildNovelSourcePack(db, id)
    const planned = planNovel(source, preset)
    const saved = saveNovelPlan(db, novelId, planned)
    const nextEdition = getNovelEdition(db, novelId)!
    return NextResponse.json(ok({
      edition: nextEdition,
      estimate: estimateNovelGeneration(preset, source.episodes.length),
      volumes: saved.volumes,
      chapters: saved.chapters,
    }), { headers: { "cache-control": "no-store" } })
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

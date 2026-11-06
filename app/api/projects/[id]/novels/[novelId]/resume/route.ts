import { after, NextResponse } from "next/server"

import { errorResponse, ok } from "@/lib/api"
import { assertProjectAccess } from "@/lib/assets/access"
import { getDbForRequest } from "@/lib/assets/store"
import { resolveProjectOwner } from "@/lib/auth/request"
import { assertNovelAccess } from "@/lib/novels/access"
import { runNovelGenerationTick } from "@/lib/novels/generator"
import { resumeNovelRun } from "@/lib/novels/repo"

export const runtime = "nodejs"
export const maxDuration = 600

type RouteContext = {
  params: { id: string; novelId: string } | Promise<{ id: string; novelId: string }>
}

export async function POST(req: Request, context: RouteContext) {
  try {
    const db = getDbForRequest()
    const ownerId = resolveProjectOwner(db, req)
    const { id, novelId } = await context.params
    assertProjectAccess(db, id, ownerId)
    assertNovelAccess(db, id, novelId, ownerId)
    const run = resumeNovelRun(db, novelId)
    if (run) {
      after(async () => {
        await runNovelGenerationTick(db, run.id)
      })
    }
    return NextResponse.json(ok({ run }), {
      headers: { "cache-control": "no-store" },
    })
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

import { NextResponse } from "next/server"

import { errorResponse, ok } from "@/lib/api"
import { assertProjectAccess } from "@/lib/assets/access"
import { getDbForRequest } from "@/lib/assets/store"
import { resolveProjectOwner, resolveRequestIdentity } from "@/lib/auth/request"
import { assertNovelAccess } from "@/lib/novels/access"
import { generateNovelChapterWithModel } from "@/lib/novels/generator"
import {
  getNovelChapter,
  listNovelChapters,
  updateNovelChapter,
} from "@/lib/novels/repo"
import { buildNovelSourcePack } from "@/lib/novels/source-pack"
import { withQuotaReservation } from "@/lib/quota"
import { enforceApiRateLimit } from "@/lib/security/api-rate-limit"

export const runtime = "nodejs"
export const maxDuration = 300

type RouteContext = {
  params: {
    id: string
    novelId: string
    chapterId: string
  } | Promise<{
    id: string
    novelId: string
    chapterId: string
  }>
}

export async function POST(req: Request, context: RouteContext) {
  try {
    const db = getDbForRequest()
    const ownerId = resolveProjectOwner(db, req)
    const identity = resolveRequestIdentity(db, req)
    const { id, novelId, chapterId } = await context.params
    assertProjectAccess(db, id, ownerId)
    assertNovelAccess(db, id, novelId, ownerId)
    const chapter = getNovelChapter(db, novelId, chapterId)
    if (!chapter) {
      return NextResponse.json(
        { success: false, data: null, error: "章节不存在" },
        { status: 404 },
      )
    }
    enforceApiRateLimit(db, req, "novel", { identity })
    const { value } = await withQuotaReservation(db, identity, "novel", 1, async () => {
      const sourcePack = buildNovelSourcePack(db, id)
      const previousChapters = listNovelChapters(db, novelId)
        .filter((item) => item.number < chapter.number && item.summary)
        .slice(-2)
        .map((item) => ({ number: item.number, title: item.title, summary: item.summary }))
      const result = await generateNovelChapterWithModel({
        chapter,
        previousChapters,
        sourcePack,
      })
      return updateNovelChapter(db, novelId, chapter.number, {
        title: result.title,
        content: result.content,
        summary: result.summary || chapter.outline,
        sourceSignature: sourcePack.signature,
        changeKind: "regenerated",
      })
    })
    return NextResponse.json(ok({ chapter: value }), {
      headers: { "cache-control": "no-store" },
    })
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

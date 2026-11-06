import { NextResponse } from "next/server"

import { errorResponse, ok } from "@/lib/api"
import { assertProjectAccess } from "@/lib/assets/access"
import { getDbForRequest } from "@/lib/assets/store"
import { resolveProjectOwner } from "@/lib/auth/request"
import { assertNovelAccess } from "@/lib/novels/access"
import { getNovelChapter, updateNovelChapter } from "@/lib/novels/repo"

export const runtime = "nodejs"

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

export async function PATCH(req: Request, context: RouteContext) {
  try {
    const body = await req.json().catch(() => null)
    const db = getDbForRequest()
    const ownerId = resolveProjectOwner(db, req)
    const { id, novelId, chapterId } = await context.params
    assertProjectAccess(db, id, ownerId)
    const edition = assertNovelAccess(db, id, novelId, ownerId)
    const chapter = getNovelChapter(db, novelId, chapterId)
    if (!chapter) {
      return NextResponse.json(
        { success: false, data: null, error: "章节不存在" },
        { status: 404 },
      )
    }
    const updated = updateNovelChapter(db, novelId, chapter.number, {
      title: body?.title,
      outline: body?.outline,
      content: body?.content,
      summary: body?.summary,
      sourceSignature: edition.sourceSignature,
      changeKind: "manual",
    })
    return NextResponse.json(ok({ chapter: updated }), {
      headers: { "cache-control": "no-store" },
    })
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

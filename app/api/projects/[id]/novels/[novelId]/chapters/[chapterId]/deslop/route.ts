import { NextResponse } from "next/server"

import { errorResponse, ok } from "@/lib/api"
import { assertProjectAccess } from "@/lib/assets/access"
import { getDbForRequest } from "@/lib/assets/store"
import { resolveProjectOwner, resolveRequestIdentity } from "@/lib/auth/request"
import { assertNovelAccess } from "@/lib/novels/access"
import {
  buildDeslopPrompt,
  normalizeDeslopResult,
} from "@/lib/novels/deslop"
import { auditNovelChapter } from "@/lib/novels/lint"
import { getNovelChapter, updateNovelChapter } from "@/lib/novels/repo"
import { chatJson } from "@/lib/deepseek"
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
    const body = await req.json().catch(() => null)
    const db = getDbForRequest()
    const ownerId = resolveProjectOwner(db, req)
    const identity = resolveRequestIdentity(db, req)
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
    const report = auditNovelChapter({
      content: chapter.content,
      targetWords: chapter.targetWords,
      hook: chapter.hook,
    })
    const mode = body?.mode === "preview" || body?.mode === "apply" ? body.mode : "audit"
    if (mode === "audit") {
      return NextResponse.json(ok({ report, chapter }), {
        headers: { "cache-control": "no-store" },
      })
    }
    if (mode === "apply") {
      const content = typeof body?.content === "string" ? body.content.trim() : ""
      if (!content) {
        return NextResponse.json(
          { success: false, data: null, error: "请先预览修订稿再应用" },
          { status: 400 },
        )
      }
      const updated = updateNovelChapter(db, novelId, chapter.number, {
        content,
        summary: typeof body?.summary === "string" ? body.summary : chapter.summary,
        sourceSignature: edition.sourceSignature,
        changeKind: "deslop",
      })
      return NextResponse.json(ok({
        chapter: updated,
        report: auditNovelChapter({
          content: updated.content,
          targetWords: updated.targetWords,
          hook: updated.hook,
        }),
      }), { headers: { "cache-control": "no-store" } })
    }

    enforceApiRateLimit(db, req, "novel", { identity })
    const { value } = await withQuotaReservation(db, identity, "novel", 1, async () => {
      const prompt = buildDeslopPrompt(chapter, report)
      const raw = await chatJson<unknown>(prompt.system, prompt.user, {
        temperature: 0.35,
        maxTokens: Math.max(4_000, Math.min(9_000, chapter.targetWords * 2)),
      })
      return {
        proposed: normalizeDeslopResult(raw),
        promptVersion: prompt.promptVersion,
      }
    })
    return NextResponse.json(ok({
      proposed: value.proposed,
      promptVersion: value.promptVersion,
      report,
      chapter,
    }), { headers: { "cache-control": "no-store" } })
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

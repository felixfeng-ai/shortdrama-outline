import { NextResponse } from "next/server"

import { errorResponse } from "@/lib/api"
import { assertProjectAccess } from "@/lib/assets/access"
import { getDbForRequest } from "@/lib/assets/store"
import { resolveProjectOwner, resolveRequestIdentity } from "@/lib/auth/request"
import { assertNovelAccess } from "@/lib/novels/access"
import { buildNovelExport } from "@/lib/novels/export"
import { novelPresetLabel } from "@/lib/novels/presets"
import { NOVEL_PROMPT_VERSION } from "@/lib/novels/prompts"
import { listNovelChapters } from "@/lib/novels/repo"
import type { NovelExportFormat } from "@/lib/novels/types"
import { enforceApiRateLimit } from "@/lib/security/api-rate-limit"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteContext = {
  params: { id: string; novelId: string } | Promise<{ id: string; novelId: string }>
}

const FORMATS = new Set<NovelExportFormat>(["md", "txt", "docx", "epub", "zip"])

export async function GET(req: Request, context: RouteContext) {
  try {
    const db = getDbForRequest()
    const ownerId = resolveProjectOwner(db, req)
    const identity = resolveRequestIdentity(db, req)
    const { id, novelId } = await context.params
    assertProjectAccess(db, id, ownerId)
    const edition = assertNovelAccess(db, id, novelId, ownerId)
    enforceApiRateLimit(db, req, "export", { identity })
    const rawFormat = new URL(req.url).searchParams.get("format") || "md"
    const format = FORMATS.has(rawFormat as NovelExportFormat)
      ? rawFormat as NovelExportFormat
      : "md"
    const chapters = listNovelChapters(db, novelId)
      .filter((chapter) => chapter.content.trim() && ["generated", "edited", "stale"].includes(chapter.status))
      .map((chapter) => ({
        number: chapter.number,
        title: chapter.title,
        content: chapter.content,
        wordCount: chapter.wordCount,
      }))
    const artifact = buildNovelExport({
      title: edition.title,
      presetLabel: novelPresetLabel(edition.preset),
      status: edition.status,
      model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
      promptVersion: NOVEL_PROMPT_VERSION,
      sourceSnapshotIds: edition.sourceSnapshotIds,
      chapters,
    }, format)
    const filename = encodeURIComponent(artifact.filename)
    return new NextResponse(new Blob([artifact.bytes as unknown as BlobPart]), {
      headers: {
        "content-type": artifact.mime,
        "content-disposition": `attachment; filename*=UTF-8''${filename}`,
        "cache-control": "no-store",
      },
    })
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

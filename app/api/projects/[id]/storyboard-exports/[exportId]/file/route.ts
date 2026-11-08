import { NextResponse } from "next/server"

import { errorResponse, InputError } from "@/lib/api"
import { assertProjectAccess } from "@/lib/assets/access"
import { getDbForRequest } from "@/lib/assets/store"
import { resolveProjectOwner } from "@/lib/auth/request"
import { readGeneratedAsset } from "@/lib/generation/files"
import { getStoryboardExport } from "@/lib/production/storyboard-export-repo"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string; exportId: string }> },
) {
  try {
    const db = getDbForRequest()
    const params = await context.params
    assertProjectAccess(db, params.id, resolveProjectOwner(db, req))
    const job = getStoryboardExport(db, params.id, params.exportId)
    if (!job || job.status !== "ready") throw new InputError("动态分镜导出文件尚未就绪")
    const kind = new URL(req.url).searchParams.get("kind") ?? "video"
    const key = kind === "srt" ? job.srtStorageKey : job.videoStorageKey
    if (!key) throw new InputError("动态分镜导出文件不存在")
    const bytes = readGeneratedAsset(key)
    const body = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer
    return new Response(body, {
      headers: {
        "cache-control": "no-store",
        "content-type": kind === "srt" ? "application/x-subrip; charset=utf-8" : "video/mp4",
        "content-disposition": `attachment; filename="storyboard-${job.id}.${kind === "srt" ? "srt" : "mp4"}"`,
      },
    })
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

import { NextResponse } from "next/server"

import { InputError, errorResponse } from "@/lib/api"
import { assertProjectAccess } from "@/lib/assets/access"
import { getDbForRequest } from "@/lib/assets/store"
import { getBgmTrack } from "@/lib/audio/bgm-repo"
import { resolveProjectOwner } from "@/lib/auth/request"
import { readGeneratedAsset } from "@/lib/generation/files"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteContext = { params: { id: string } | Promise<{ id: string }> }

export async function GET(req: Request, context: RouteContext) {
  try {
    const url = new URL(req.url)
    const projectId = url.searchParams.get("projectId")?.trim() ?? ""
    if (!projectId) throw new InputError("缺少 projectId")
    const params = await context.params
    const db = getDbForRequest()
    assertProjectAccess(db, projectId, resolveProjectOwner(db, req))
    const track = getBgmTrack(db, projectId, params.id)
    if (!track) throw new InputError("BGM 不存在或无权访问")
    const bytes = readGeneratedAsset(track.storageKey)
    const body = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": track.mime,
        "Content-Length": String(bytes.length),
        "Cache-Control": "private, max-age=3600",
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(track.name)}`,
        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

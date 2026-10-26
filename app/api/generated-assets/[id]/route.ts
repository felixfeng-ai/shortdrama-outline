import { NextResponse } from "next/server"

import { errorResponse } from "@/lib/api"
import { assertProjectAccess } from "@/lib/assets/access"
import { getDbForRequest } from "@/lib/assets/store"
import { resolveProjectOwner } from "@/lib/auth/request"
import { readGeneratedImage } from "@/lib/generation/files"
import { findGeneratedAssetById } from "@/lib/generation/repo"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function statusError(message: string, status: number): Error {
  const error = new Error(message) as Error & { status: number }
  error.status = status
  return error
}

export async function GET(
  req: Request,
  context: { params: { id: string } },
) {
  try {
    const id = context.params.id?.trim() || ""
    if (!id) throw statusError("缺少关键帧 id", 400)
    const db = getDbForRequest()
    const asset = findGeneratedAssetById(db, id)
    if (!asset) throw statusError("关键帧不存在", 404)
    assertProjectAccess(db, asset.projectId, resolveProjectOwner(db, req))
    const bytes = readGeneratedImage(asset.storageKey)
    const body = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": asset.mime,
        "Content-Length": String(bytes.length),
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch (error) {
    const { body, status } = errorResponse(error)
    return NextResponse.json(body, { status })
  }
}

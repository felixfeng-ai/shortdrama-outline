import { NextResponse } from "next/server"

import { InputError, errorResponse } from "@/lib/api"
import { assertProjectAccess } from "@/lib/assets/access"
import { getDbForRequest } from "@/lib/assets/store"
import { resolveProjectOwner } from "@/lib/auth/request"
import {
  readDeliveryArtifact,
  type DeliveryArtifactKind,
} from "@/lib/delivery/files"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function artifactKind(value: string | null): DeliveryArtifactKind {
  return value === "manifest" || value === "clean" || value === "publish"
    || value === "srt" || value === "ass" || value === "cover" || value === "metadata"
    ? value
    : "package"
}

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const url = new URL(req.url)
    const projectId = url.searchParams.get("projectId")?.trim() ?? ""
    if (!projectId) throw new InputError("缺少 projectId")
    const db = getDbForRequest()
    assertProjectAccess(db, projectId, resolveProjectOwner(db, req))
    const params = await context.params
    const artifact = readDeliveryArtifact(
      db,
      params.id,
      artifactKind(url.searchParams.get("kind")),
      url.searchParams.get("itemId")?.trim() || undefined,
    )
    if (!artifact) throw new InputError("交付文件不存在或尚未完成")
    const body = artifact.bytes.buffer.slice(
      artifact.bytes.byteOffset,
      artifact.bytes.byteOffset + artifact.bytes.byteLength,
    ) as ArrayBuffer
    return new NextResponse(body, {
      headers: {
        "Content-Type": artifact.mime,
        "Content-Length": String(artifact.bytes.length),
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(artifact.filename)}`,
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
        "X-AI-Generated": "true",
      },
    })
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

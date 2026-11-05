import { NextResponse } from "next/server"

import { InputError, errorResponse } from "../api.ts"
import { assertProjectAccess } from "../assets/access.ts"
import { getDbForRequest } from "../assets/store.ts"
import { resolveProjectOwner } from "../auth/request.ts"
import { readRenderArtifact } from "./render-service.ts"

export async function renderArtifactResponse(
  req: Request,
  id: string,
  kind: "video" | "srt" | "manifest",
): Promise<NextResponse> {
  try {
    const url = new URL(req.url)
    const projectId = url.searchParams.get("projectId")?.trim() ?? ""
    if (!projectId) throw new InputError("缺少 projectId")
    const db = getDbForRequest()
    assertProjectAccess(db, projectId, resolveProjectOwner(db, req))
    const artifact = readRenderArtifact(db, projectId, id, kind)
    if (!artifact) throw new InputError("渲染产物不存在、尚未完成或无权访问")
    const body = artifact.bytes.buffer.slice(
      artifact.bytes.byteOffset,
      artifact.bytes.byteOffset + artifact.bytes.byteLength,
    ) as ArrayBuffer
    return new NextResponse(body, {
      status: 200,
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

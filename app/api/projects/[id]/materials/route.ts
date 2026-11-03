import { NextResponse } from "next/server"

import { InputError, errorResponse, ok } from "@/lib/api"
import { assertProjectAccess } from "@/lib/assets/access"
import {
  MAX_PROJECT_MATERIAL_INPUT_BYTES,
  deleteProjectMaterial,
  listProjectMaterials,
  saveProjectMaterial,
} from "@/lib/assets/materials"
import { getDbForRequest } from "@/lib/assets/store"
import { resolveProjectOwner } from "@/lib/auth/request"
import { resolveRequestIdentity } from "@/lib/auth/request"
import { enforceApiRateLimit } from "@/lib/security/api-rate-limit"
import { buildSourceIndex } from "@/lib/skills/source-index"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteContext = { params: { id: string } | Promise<{ id: string }> }

function requiredString(value: unknown, message: string): string {
  const text = typeof value === "string" ? value.trim() : ""
  if (!text) throw new InputError(message)
  return text
}

export async function GET(req: Request, context: RouteContext) {
  try {
    const db = getDbForRequest()
    const ownerId = resolveProjectOwner(db, req)
    const params = await context.params
    assertProjectAccess(db, params.id, ownerId)
    const url = new URL(req.url)
    const materialId = url.searchParams.get("materialId")?.trim() ?? ""
    if (materialId) {
      const material = listProjectMaterials(db, params.id).find((item) => item.id === materialId)
      if (!material) throw new InputError("素材不存在或已删除")
      const index = buildSourceIndex(material)
      const rawChunk = url.searchParams.get("chunk")
      if (rawChunk === null) {
        return NextResponse.json(ok({
          material: {
            id: material.id,
            name: material.name,
            kind: material.kind,
            characterCount: material.characterCount,
            chunkCount: index.chunks.length,
          },
          chunks: index.chunks.map((chunk) => ({
            index: chunk.index,
            title: chunk.title,
            characterCount: chunk.characterCount,
          })),
        }), { headers: { "cache-control": "no-store" } })
      }
      const chunkIndex = Number(rawChunk)
      const chunk = Number.isSafeInteger(chunkIndex) ? index.chunks[chunkIndex] : undefined
      if (!chunk) throw new InputError("章节索引超出范围")
      return NextResponse.json(ok({
        material: { id: material.id, name: material.name, kind: material.kind },
        chunk,
      }), { headers: { "cache-control": "no-store" } })
    }
    const includeContent = url.searchParams.get("includeContent") === "1"
    return NextResponse.json(ok({
      materials: listProjectMaterials(db, params.id).map((material) => {
        const index = buildSourceIndex(material)
        return {
          ...material,
          content: includeContent ? material.content : "",
          chunkCount: index.chunks.length,
        }
      }),
    }), { headers: { "cache-control": "no-store" } })
  } catch (error) {
    const { body, status } = errorResponse(error)
    return NextResponse.json(body, { status })
  }
}

export async function POST(req: Request, context: RouteContext) {
  try {
    const rateDb = getDbForRequest()
    enforceApiRateLimit(rateDb, req, "material", {
      identity: resolveRequestIdentity(rateDb, req),
    })
    const body = await req.json().catch(() => null)
    const db = rateDb
    const ownerId = resolveProjectOwner(db, req)
    const params = await context.params
    assertProjectAccess(db, params.id, ownerId)
    const content = requiredString(body?.content, "缺少素材正文")
    const bytes = typeof body?.bytes === "number" ? body.bytes : Buffer.byteLength(content)
    if (bytes > MAX_PROJECT_MATERIAL_INPUT_BYTES) {
      throw new InputError("单个文本素材不能超过 2 MB")
    }
    const material = saveProjectMaterial(db, {
      projectId: params.id,
      ownerId,
      name: requiredString(body?.name, "缺少素材名称"),
      mime: typeof body?.mime === "string" ? body.mime : "text/plain",
      bytes,
      kind: body?.kind === "novel" || body?.kind === "script" || body?.kind === "notes"
        ? body.kind
        : undefined,
      content,
    })
    return NextResponse.json(ok({
      material,
      deduped: material.deduped,
    }), { status: material.deduped ? 200 : 201 })
  } catch (error) {
    const { body, status } = errorResponse(error)
    return NextResponse.json(body, { status })
  }
}

export async function DELETE(req: Request, context: RouteContext) {
  try {
    const url = new URL(req.url)
    const id = requiredString(url.searchParams.get("id"), "缺少素材 id")
    const db = getDbForRequest()
    const ownerId = resolveProjectOwner(db, req)
    const params = await context.params
    assertProjectAccess(db, params.id, ownerId)
    const removed = deleteProjectMaterial(db, params.id, id)
    if (!removed) throw new InputError("素材不存在或已删除")
    return NextResponse.json(ok({ removed: true }))
  } catch (error) {
    const { body, status } = errorResponse(error)
    return NextResponse.json(body, { status })
  }
}

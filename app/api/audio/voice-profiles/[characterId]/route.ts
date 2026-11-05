import { NextResponse } from "next/server"

import { InputError, errorResponse, ok } from "@/lib/api"
import { assertProjectAccess } from "@/lib/assets/access"
import { getDbForRequest } from "@/lib/assets/store"
import { deleteVoiceProfile, upsertVoiceProfile } from "@/lib/audio/repo"
import { resolveProjectOwner } from "@/lib/auth/request"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteContext = {
  params: { characterId: string } | Promise<{ characterId: string }>
}

function requiredString(value: unknown, message: string): string {
  const text = typeof value === "string" ? value.trim() : ""
  if (!text) throw new InputError(message)
  return text
}

function optionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined
  const number = Number(value)
  if (!Number.isFinite(number)) throw new InputError("音色参数不正确")
  return number
}

async function characterIdFrom(context: RouteContext): Promise<string> {
  const params = await context.params
  return requiredString(params.characterId, "缺少角色 id")
}

export async function PUT(req: Request, context: RouteContext) {
  try {
    const body = await req.json().catch(() => null)
    const projectId = requiredString(body?.projectId, "缺少 projectId")
    const voiceId = requiredString(body?.voiceId, "缺少系统音色")
    const characterId = await characterIdFrom(context)
    const db = getDbForRequest()
    assertProjectAccess(db, projectId, resolveProjectOwner(db, req))
    return NextResponse.json(ok({
      profile: upsertVoiceProfile(db, projectId, characterId, {
        voiceId,
        speed: optionalNumber(body?.speed),
        volume: optionalNumber(body?.volume),
      }),
    }), { headers: { "cache-control": "no-store" } })
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

export async function DELETE(req: Request, context: RouteContext) {
  try {
    const url = new URL(req.url)
    const projectId = requiredString(url.searchParams.get("projectId"), "缺少 projectId")
    const characterId = await characterIdFrom(context)
    const db = getDbForRequest()
    assertProjectAccess(db, projectId, resolveProjectOwner(db, req))
    return NextResponse.json(ok({
      deleted: deleteVoiceProfile(db, projectId, characterId),
    }), { headers: { "cache-control": "no-store" } })
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

import { NextResponse } from "next/server"

import { InputError, errorResponse, ok } from "@/lib/api"
import { assertProjectAccess } from "@/lib/assets/access"
import { getDbForRequest } from "@/lib/assets/store"
import {
  listVoiceCharacters,
  listVoiceProfiles,
} from "@/lib/audio/repo"
import { SYSTEM_VOICES } from "@/lib/audio/voices"
import { getMiniMaxSpeechAvailability } from "@/lib/audio/tts-model"
import { resolveProjectOwner } from "@/lib/auth/request"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function requiredString(value: string | null, message: string): string {
  const text = value?.trim() ?? ""
  if (!text) throw new InputError(message)
  return text
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const projectId = requiredString(url.searchParams.get("projectId"), "缺少 projectId")
    const db = getDbForRequest()
    assertProjectAccess(db, projectId, resolveProjectOwner(db, req))
    return NextResponse.json(ok({
      voices: SYSTEM_VOICES,
      characters: listVoiceCharacters(db, projectId),
      profiles: listVoiceProfiles(db, projectId),
      tts: getMiniMaxSpeechAvailability(),
    }), { headers: { "cache-control": "no-store" } })
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

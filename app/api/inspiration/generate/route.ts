import { NextResponse } from "next/server"

import { InputError, errorResponse, ok } from "@/lib/api"
import { getDbForRequest } from "@/lib/assets/store"
import { resolveRequestIdentity } from "@/lib/auth/request"
import { chatJson } from "@/lib/deepseek"
import {
  buildInspirationPrompt,
  normalizeCreativeSeeds,
  readInspirationInput,
} from "@/lib/inspiration"
import { withQuotaReservation } from "@/lib/quota"
import { enforceApiRateLimit } from "@/lib/security/api-rate-limit"

export const runtime = "nodejs"
export const maxDuration = 60

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)
    const input = readInspirationInput(body)
    const db = getDbForRequest()
    const identity = resolveRequestIdentity(db, req)
    enforceApiRateLimit(db, req, "model", { identity })
    const { value } = await withQuotaReservation(db, identity, "ideas", 1, async () => {
      const { system, user } = buildInspirationPrompt(input)
      const raw = await chatJson<unknown>(system, user, {
        temperature: 1.05,
        maxTokens: 4_500,
      })
      const creativeSeeds = normalizeCreativeSeeds(raw)
      if (creativeSeeds.length === 0) {
        throw new InputError("这一轮没有生成可用方向，请换一组条件再试")
      }
      return { creativeSeeds }
    })
    return NextResponse.json(ok(value), {
      headers: { "cache-control": "no-store" },
    })
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

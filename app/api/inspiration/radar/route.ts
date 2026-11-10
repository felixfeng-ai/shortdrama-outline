import { NextResponse } from "next/server"

import { errorResponse, ok } from "@/lib/api"
import { getInspirationRadar } from "@/lib/inspiration"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  try {
    return NextResponse.json(ok({ radar: getInspirationRadar() }), {
      headers: { "cache-control": "no-store" },
    })
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

import { NextResponse } from "next/server"

import { errorResponse, ok } from "@/lib/api"
import { adminRequestContext } from "@/lib/admin/request"
import { summarizeWebVitals } from "@/lib/web-vitals"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  try {
    const { db } = adminRequestContext(req)
    const days = Number(new URL(req.url).searchParams.get("days")) || 7
    return NextResponse.json(ok({
      days,
      rows: summarizeWebVitals(db, { days }),
    }), { headers: { "cache-control": "no-store" } })
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

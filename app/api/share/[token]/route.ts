import { NextResponse } from "next/server"

import { errorResponse, ok } from "@/lib/api"
import { getDbForRequest } from "@/lib/assets/store"
import { loadProjectShare } from "@/lib/assets/shares"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(
  _req: Request,
  context: { params: { token: string } },
) {
  try {
    const review = loadProjectShare(getDbForRequest(), context.params.token)
    if (!review) {
      return NextResponse.json(
        { success: false, data: null, error: "审阅链接已失效" },
        { status: 404, headers: { "cache-control": "no-store" } },
      )
    }
    return NextResponse.json(ok({ review }), {
      headers: { "cache-control": "no-store" },
    })
  } catch (error) {
    const { body, status } = errorResponse(error)
    return NextResponse.json(body, { status })
  }
}

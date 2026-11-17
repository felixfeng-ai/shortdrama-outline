import { NextResponse } from "next/server"

import { errorResponse, ok } from "@/lib/api"
import { adminRequestContext } from "@/lib/admin/request"
import { listAdminUsers } from "@/lib/admin/users"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  try {
    const { db } = adminRequestContext(req)
    const url = new URL(req.url)
    const query = url.searchParams.get("query") ?? ""
    const limit = Number(url.searchParams.get("limit")) || 50
    return NextResponse.json(ok({
      users: listAdminUsers(db, { query, limit }),
    }), { headers: { "cache-control": "no-store" } })
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

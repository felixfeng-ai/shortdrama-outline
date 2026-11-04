import { NextResponse } from "next/server"

import { errorResponse, ok } from "@/lib/api"
import { getDbForRequest } from "@/lib/assets/store"
import { resolveProjectOwner } from "@/lib/auth/request"
import {
  createContentReport,
  listContentReports,
  readContentReport,
} from "@/lib/trust/reports"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  try {
    const db = getDbForRequest()
    return NextResponse.json(ok({
      reports: listContentReports(db, resolveProjectOwner(db, req)),
    }))
  } catch (error) {
    const { body, status } = errorResponse(error)
    return NextResponse.json(body, { status })
  }
}

export async function POST(req: Request) {
  try {
    const db = getDbForRequest()
    const input = readContentReport(await req.json().catch(() => null))
    const report = createContentReport(db, resolveProjectOwner(db, req), input)
    return NextResponse.json(ok({ report }))
  } catch (error) {
    const { body, status } = errorResponse(error)
    return NextResponse.json(body, { status })
  }
}

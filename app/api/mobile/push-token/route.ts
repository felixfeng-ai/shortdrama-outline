import { NextResponse } from "next/server"

import { errorResponse, ok } from "@/lib/api"
import { getDbForRequest } from "@/lib/assets/store"
import { resolveProjectOwner } from "@/lib/auth/request"
import {
  removeNativePushToken,
  upsertNativePushToken,
} from "@/lib/push/native-repo"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)
    const db = getDbForRequest()
    const saved = upsertNativePushToken(db, resolveProjectOwner(db, req), body)
    return NextResponse.json(ok({ id: saved.id, token: saved.token }))
  } catch (error) {
    const { body, status } = errorResponse(error)
    return NextResponse.json(body, { status })
  }
}

export async function DELETE(req: Request) {
  try {
    const body = await req.json().catch(() => null)
    const token = typeof body?.token === "string" ? body.token.trim() : ""
    const db = getDbForRequest()
    const removed = removeNativePushToken(db, resolveProjectOwner(db, req), token)
    return NextResponse.json(ok({ removed }))
  } catch (error) {
    const { body, status } = errorResponse(error)
    return NextResponse.json(body, { status })
  }
}

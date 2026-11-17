import { NextResponse } from "next/server"

import { InputError, errorResponse, ok } from "@/lib/api"
import { adminRequestContext } from "@/lib/admin/request"
import { revokeQuotaOverride, setQuotaOverride } from "@/lib/admin/users"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function targetUserId(value: unknown): string {
  const id = typeof value === "string" ? value.trim() : ""
  if (!id) throw new InputError("缺少目标用户")
  return id
}

export async function POST(req: Request) {
  try {
    const { db, user } = adminRequestContext(req)
    const body = await req.json().catch(() => null)
    const override = setQuotaOverride(db, {
      adminUserId: user.id,
      targetUserId: targetUserId(body?.targetUserId),
      extraUnits: Number(body?.extraUnits),
      expiresAt: Number(body?.expiresAt),
      reason: typeof body?.reason === "string" ? body.reason : "",
    })
    return NextResponse.json(ok({ override }), {
      headers: { "cache-control": "no-store" },
    })
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

export async function DELETE(req: Request) {
  try {
    const { db, user } = adminRequestContext(req)
    const body = await req.json().catch(() => null)
    revokeQuotaOverride(db, {
      adminUserId: user.id,
      targetUserId: targetUserId(body?.targetUserId),
      reason: typeof body?.reason === "string" ? body.reason : "",
    })
    return NextResponse.json(ok({ revoked: true }), {
      headers: { "cache-control": "no-store" },
    })
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

import { NextResponse } from "next/server"

import { InputError, errorResponse, ok } from "@/lib/api"
import { getDbForRequest } from "@/lib/assets/store"
import {
  removePushSubscription,
  upsertPushSubscription,
} from "@/lib/push/repo"
import {
  isAllowedPushEndpoint,
  readPushSubscription,
} from "@/lib/push/subscription"
import { resolveProjectOwner } from "@/lib/auth/request"

export const runtime = "nodejs"

function pushEnabled(): boolean {
  return Boolean(
    process.env.WEB_PUSH_PUBLIC_KEY?.trim()
    && process.env.WEB_PUSH_PRIVATE_KEY?.trim(),
  )
}

export async function GET() {
  const enabled = pushEnabled()
  return NextResponse.json(ok({
    enabled,
    publicKey: enabled ? process.env.WEB_PUSH_PUBLIC_KEY?.trim() : "",
  }))
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)
    const subscription = readPushSubscription(body?.subscription)
    if (!subscription) throw new InputError("浏览器推送订阅格式不正确")
    if (!pushEnabled()) throw new InputError("当前服务尚未启用完成通知")
    const db = getDbForRequest()
    const saved = upsertPushSubscription(db, resolveProjectOwner(db, req), subscription)
    return NextResponse.json(ok({ id: saved.id, endpoint: saved.endpoint }))
  } catch (error) {
    const { body, status } = errorResponse(error)
    return NextResponse.json(body, { status })
  }
}

export async function DELETE(req: Request) {
  try {
    const body = await req.json().catch(() => null)
    const endpoint = typeof body?.endpoint === "string" ? body.endpoint.trim() : ""
    if (!endpoint || !isAllowedPushEndpoint(endpoint)) {
      throw new InputError("浏览器推送地址不正确")
    }
    const db = getDbForRequest()
    const removed = removePushSubscription(db, resolveProjectOwner(db, req), endpoint)
    return NextResponse.json(ok({ removed }))
  } catch (error) {
    const { body, status } = errorResponse(error)
    return NextResponse.json(body, { status })
  }
}

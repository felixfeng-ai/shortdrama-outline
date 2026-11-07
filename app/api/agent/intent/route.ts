// 无模型、无额度的意图识别接口，Web、PWA 与 App 共用同一套路由规则。
import { NextResponse } from "next/server"

import { errorResponse, InputError, ok } from "@/lib/api"
import { detectAgentIntent } from "@/lib/agent/intent"

export const runtime = "nodejs"

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)
    const text = typeof body?.text === "string" ? body.text.trim() : ""
    if (!text) throw new InputError("缺少要识别的 Agent 请求")
    return NextResponse.json(ok({ intent: detectAgentIntent(text.slice(0, 4000)) }))
  } catch (error) {
    const { body, status } = errorResponse(error)
    return NextResponse.json(body, { status })
  }
}

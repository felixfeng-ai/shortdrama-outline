// 快速创作预算：开始前一次返回故事、首帧和单镜头视频三种范围。
import { NextResponse } from "next/server"

import { errorResponse, ok } from "@/lib/api"
import { getQuickCreationQuotes } from "@/lib/production/quick-creation-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(_req?: Request) {
  try {
    return NextResponse.json(ok({ quotes: getQuickCreationQuotes() }))
  } catch (error) {
    const { body, status } = errorResponse(error)
    return NextResponse.json(body, { status })
  }
}

import { NextResponse } from "next/server"

import { errorResponse, ok } from "@/lib/api"
import { getPublicVideoCapabilities } from "@/lib/video/model"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * 只返回启用状态、模型、分辨率和价格。
 * 供应商密钥只在服务端读取，绝不能进入该响应。
 */
export async function GET() {
  try {
    return NextResponse.json(ok(getPublicVideoCapabilities()))
  } catch (error) {
    const { body, status } = errorResponse(error)
    return NextResponse.json(body, { status })
  }
}

import { NextResponse } from "next/server"

import { errorResponse, ok } from "@/lib/api"
import { getDbForRequest } from "@/lib/assets/store"
import { currentAuthUser } from "@/lib/auth/request"
import { AuthError } from "@/lib/auth/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  try {
    const user = currentAuthUser(getDbForRequest(), req)
    if (!user) throw new AuthError("请先登录", 401)
    const skus = (process.env.APP_BILLING_PRODUCT_IDS ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
    return NextResponse.json(ok({
      enabled: skus.length > 0,
      skus,
      verification: process.env.BILLING_VERIFICATION_URL?.trim() ? "external" : "pending",
    }))
  } catch (error) {
    const { body, status } = errorResponse(error)
    return NextResponse.json(body, { status })
  }
}

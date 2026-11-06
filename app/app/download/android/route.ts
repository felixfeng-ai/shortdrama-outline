import { NextResponse } from "next/server"

import { resolveRuntimeMobileRelease } from "@/lib/mobile-release-store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * 稳定下载地址：二维码永远指向这里。
 * 运行时 release 清单更新后，下一次扫码会直接跳转到新 APK。
 */
export function GET(req: Request) {
  const release = resolveRuntimeMobileRelease()
  // 未配置 APK 时回退到公开的 EAS 构建记录，不把用户送到需要登录的 Web 工作台。
  const target = release.android.url
  const response = NextResponse.redirect(target, 302)
  response.headers.set("cache-control", "no-store, max-age=0")
  return response
}

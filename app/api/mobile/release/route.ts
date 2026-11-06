import { NextResponse } from "next/server"

import { errorResponse, ok } from "@/lib/api"
import { resolveRuntimeMobileRelease } from "@/lib/mobile-release-store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  try {
    const release = resolveRuntimeMobileRelease()
    return NextResponse.json(ok({
      release,
      stableUrl: new URL("/app/download/android", req.url).toString(),
      pageUrl: new URL("/app", req.url).toString(),
      qrImage: "/app-download-qr.png",
    }), {
      headers: { "cache-control": "no-store" },
    })
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

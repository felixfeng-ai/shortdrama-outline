import { NextResponse } from "next/server"

import { errorResponse, ok } from "@/lib/api"
import { getPublicVideoCapabilities } from "@/lib/video/model"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  try {
    return NextResponse.json(ok(getPublicVideoCapabilities()))
  } catch (error) {
    const { body, status } = errorResponse(error)
    return NextResponse.json(body, { status })
  }
}

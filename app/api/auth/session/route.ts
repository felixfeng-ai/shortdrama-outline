import { NextResponse } from "next/server"

import { ok } from "@/lib/api"
import { getDbForRequest } from "@/lib/assets/store"
import { currentAuthUser } from "@/lib/auth/request"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  return NextResponse.json(ok({
    user: currentAuthUser(getDbForRequest(), req),
  }))
}

import { NextResponse } from "next/server"

import { errorResponse, ok } from "@/lib/api"
import { getDbForRequest } from "@/lib/assets/store"
import { resolveProjectOwner } from "@/lib/auth/request"
import {
  listReusableAssets,
  saveReusableAsset,
  type ReusableAssetType,
} from "@/lib/assets/library"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const assetType = url.searchParams.get("assetType") || undefined
    const db = getDbForRequest()
    const ownerId = resolveProjectOwner(db, req)
    return NextResponse.json(ok({
      assets: listReusableAssets(db, ownerId, assetType as ReusableAssetType | undefined),
    }), { headers: { "cache-control": "no-store" } })
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

export async function POST(req: Request) {
  try {
    const requestBody = await req.json().catch(() => null)
    const db = getDbForRequest()
    const ownerId = resolveProjectOwner(db, req)
    return NextResponse.json(ok({
      asset: saveReusableAsset(db, ownerId, requestBody ?? {}),
    }), { headers: { "cache-control": "no-store" } })
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

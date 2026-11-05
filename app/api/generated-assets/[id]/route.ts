import { NextResponse } from "next/server"

import { errorResponse } from "@/lib/api"
import { assertProjectAccess } from "@/lib/assets/access"
import { getDbForRequest } from "@/lib/assets/store"
import { resolveProjectOwner } from "@/lib/auth/request"
import { readGeneratedAsset } from "@/lib/generation/files"
import { findGeneratedAssetById } from "@/lib/generation/repo"
import type { GeneratedAsset } from "@/lib/generation/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

interface ByteRange {
  start: number
  end: number
}

function statusError(message: string, status: number): Error {
  const error = new Error(message) as Error & { status: number }
  error.status = status
  return error
}

function mediaExtension(mime: string): string {
  if (mime === "video/mp4") return "mp4"
  if (mime === "image/png") return "png"
  if (mime === "image/jpeg") return "jpg"
  if (mime === "image/webp") return "webp"
  if (mime === "audio/mpeg") return "mp3"
  if (mime === "audio/wav" || mime === "audio/x-wav") return "wav"
  return "bin"
}

function parseRange(value: string | null, size: number): ByteRange | "invalid" | null {
  if (!value) return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim())
  if (!match) return "invalid"
  const [, rawStart, rawEnd] = match
  if (!rawStart && !rawEnd) return "invalid"

  if (!rawStart) {
    const suffixLength = Number(rawEnd)
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return "invalid"
    return {
      start: Math.max(0, size - suffixLength),
      end: size - 1,
    }
  }

  const start = Number(rawStart)
  const requestedEnd = rawEnd ? Number(rawEnd) : size - 1
  if (
    !Number.isSafeInteger(start)
    || !Number.isSafeInteger(requestedEnd)
    || start < 0
    || start >= size
    || requestedEnd < start
  ) {
    return "invalid"
  }
  return { start, end: Math.min(requestedEnd, size - 1) }
}

function baseHeaders(asset: GeneratedAsset, size: number): Headers {
  const extension = mediaExtension(asset.mime)
  return new Headers({
    "Content-Type": asset.mime,
    "Content-Length": String(size),
    "Accept-Ranges": "bytes",
    "Content-Disposition": `inline; filename="${asset.id}.${extension}"`,
    "Cache-Control": "private, max-age=3600",
    "X-Content-Type-Options": "nosniff",
    "X-AI-Generated": "true",
    "X-AI-Provider": asset.providerId,
    "X-AI-Model": asset.model,
  })
}

function loadAsset(req: Request, idValue: string | undefined) {
  const id = idValue?.trim() || ""
  if (!id) throw statusError("缺少生成资产 id", 400)
  const db = getDbForRequest()
  const asset = findGeneratedAssetById(db, id)
  if (!asset) throw statusError("生成资产不存在", 404)
  assertProjectAccess(db, asset.projectId, resolveProjectOwner(db, req))
  return { asset, bytes: readGeneratedAsset(asset.storageKey) }
}

export async function GET(
  req: Request,
  context: { params: { id: string } | Promise<{ id: string }> },
) {
  try {
    const params = await context.params
    const { asset, bytes } = loadAsset(req, params.id)
    const range = parseRange(req.headers.get("range"), bytes.length)
    const headers = baseHeaders(asset, bytes.length)

    if (range === "invalid") {
      headers.set("Content-Range", `bytes */${bytes.length}`)
      headers.delete("Content-Length")
      return new NextResponse(null, { status: 416, headers })
    }

    const selected = range ? bytes.subarray(range.start, range.end + 1) : bytes
    const body = selected.buffer.slice(
      selected.byteOffset,
      selected.byteOffset + selected.byteLength,
    ) as ArrayBuffer
    headers.set("Content-Length", String(selected.length))
    if (range) {
      headers.set("Content-Range", `bytes ${range.start}-${range.end}/${bytes.length}`)
    }
    return new NextResponse(body, {
      status: range ? 206 : 200,
      headers,
    })
  } catch (error) {
    const { body, status } = errorResponse(error)
    return NextResponse.json(body, { status })
  }
}

export async function HEAD(
  req: Request,
  context: { params: { id: string } | Promise<{ id: string }> },
) {
  try {
    const params = await context.params
    const { asset, bytes } = loadAsset(req, params.id)
    return new NextResponse(null, {
      status: 200,
      headers: baseHeaders(asset, bytes.length),
    })
  } catch (error) {
    const { body, status } = errorResponse(error)
    return NextResponse.json(body, { status })
  }
}

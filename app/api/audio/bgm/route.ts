import { NextResponse } from "next/server"
import { createHash, randomUUID } from "node:crypto"

import { InputError, errorResponse, ok } from "@/lib/api"
import { assertProjectAccess } from "@/lib/assets/access"
import { getDbForRequest } from "@/lib/assets/store"
import {
  deleteBgmTrack,
  getBgmTrack,
  listBgmTracks,
  saveBgmTrack,
} from "@/lib/audio/bgm-repo"
import { resolveProjectOwner, resolveRequestIdentity } from "@/lib/auth/request"
import {
  removeGeneratedAsset,
  writeGeneratedAudio,
} from "@/lib/generation/files"
import { enforceApiRateLimit } from "@/lib/security/api-rate-limit"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function requiredString(value: unknown, message: string): string {
  const text = typeof value === "string" ? value.trim() : ""
  if (!text) throw new InputError(message)
  return text
}

function validAudioBytes(bytes: Uint8Array, mime: string): boolean {
  // MIME 由浏览器提供，必须再校验文件头，防止把任意文件伪装成音频上传。
  if (mime === "audio/mpeg") {
    return (
      (bytes.length >= 3 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33)
      || (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0)
    )
  }
  if (mime === "audio/wav" || mime === "audio/x-wav") {
    return bytes.length >= 12
      && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
      && String.fromCharCode(...bytes.slice(8, 12)) === "WAVE"
  }
  return false
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const projectId = requiredString(url.searchParams.get("projectId"), "缺少 projectId")
    const db = getDbForRequest()
    assertProjectAccess(db, projectId, resolveProjectOwner(db, req))
    return NextResponse.json(ok({
      tracks: listBgmTracks(db, projectId),
    }), { headers: { "cache-control": "no-store" } })
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

export async function POST(req: Request) {
  try {
    const db = getDbForRequest()
    const ownerId = resolveProjectOwner(db, req)
    enforceApiRateLimit(db, req, "audio", {
      identity: resolveRequestIdentity(db, req),
    })
    const form = await req.formData().catch(() => null)
    if (!form) throw new InputError("缺少 BGM 上传内容")
    const projectId = requiredString(form.get("projectId"), "缺少 projectId")
    assertProjectAccess(db, projectId, ownerId)
    const licenseConfirmed = String(form.get("licenseConfirmed") ?? "") === "true"
    if (!licenseConfirmed) throw new InputError("必须确认拥有该 BGM 的使用授权")
    const file = form.get("file")
    if (!file || typeof file === "string") throw new InputError("缺少 BGM 文件")
    const mime = file.type.trim().toLowerCase()
    if (!["audio/mpeg", "audio/wav", "audio/x-wav"].includes(mime)) {
      throw new InputError("只支持 MP3 或 WAV 格式的 BGM")
    }
    if (file.size <= 0 || file.size > 30 * 1024 * 1024) {
      throw new InputError("BGM 文件必须小于 30MB")
    }
    const bytes = new Uint8Array(await file.arrayBuffer())
    if (!validAudioBytes(bytes, mime)) throw new InputError("BGM 文件格式与内容不匹配")
    const id = randomUUID()
    const stored = writeGeneratedAudio(projectId, `${id}-bgm`, bytes, mime)
    const durationValue = Number(form.get("durationMs"))
    const track = saveBgmTrack(db, {
      id,
      projectId,
      name: requiredString(form.get("name") || file.name, "BGM 名称不能为空"),
      storageKey: stored.storageKey,
      mime,
      bytes: stored.bytes,
      durationMs: Number.isFinite(durationValue) && durationValue > 0
        ? Math.round(durationValue)
        : null,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      licenseConfirmed: true,
      licenseNote: String(form.get("licenseNote") ?? ""),
    })
    return NextResponse.json(ok({ track }))
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

export async function DELETE(req: Request) {
  try {
    const url = new URL(req.url)
    const projectId = requiredString(url.searchParams.get("projectId"), "缺少 projectId")
    const id = requiredString(url.searchParams.get("id"), "缺少 BGM id")
    const db = getDbForRequest()
    assertProjectAccess(db, projectId, resolveProjectOwner(db, req))
    const track = getBgmTrack(db, projectId, id)
    if (!track) throw new InputError("BGM 不存在或无权访问")
    const deleted = deleteBgmTrack(db, projectId, id)
    if (deleted) removeGeneratedAsset(track.storageKey)
    return NextResponse.json(ok({ deleted }))
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

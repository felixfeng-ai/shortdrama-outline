// 图台账接口：登记「角色/镜头 用了哪张本地图」。
//
// ★ 原则 P1 的强制点：这里**只接受元数据**，任何携带二进制内容的请求一律拒绝。
// 图本身留在用户的本地图库，服务端只有 vaultKey 与 fileHash。
import { NextResponse } from "next/server"
import { InputError, errorResponse, ok } from "@/lib/api"
import { getDbForRequest } from "@/lib/assets/store"
import { listRefs } from "@/lib/assets/refs"
import { randomUUID } from "node:crypto"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

interface IncomingRef {
  vaultKey?: unknown; label?: unknown; fileHash?: unknown
  mime?: unknown; bytes?: unknown; ownerType?: unknown; ownerId?: unknown
}

/** 明确禁止的二进制字段名——出现即拒绝，防止有人绕开约定上传像素 */
const FORBIDDEN = ["data", "base64", "blob", "buffer", "content", "file", "image"]

function rejectIfBinary(raw: Record<string, unknown>) {
  for (const key of FORBIDDEN) {
    if (key in raw) throw new InputError("本接口只接收图片引用信息，不接受图片内容本身")
  }
}

export async function GET(req: Request) {
  try {
    const projectId = new URL(req.url).searchParams.get("projectId") || ""
    if (!projectId) throw new InputError("缺少 projectId")
    return NextResponse.json(ok({ refs: listRefs(getDbForRequest(), projectId) }))
  } catch (error) {
    const { body, status } = errorResponse(error)
    return NextResponse.json(body, { status })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)
    const projectId = typeof body?.projectId === "string" ? body.projectId : ""
    if (!projectId) throw new InputError("缺少 projectId")

    const incoming: IncomingRef[] = Array.isArray(body?.refs) ? body.refs : []
    if (incoming.length === 0) throw new InputError("没有要登记的图片")
    if (incoming.length > 500) throw new InputError("一次最多登记 500 张图片")

    const db = getDbForRequest()
    const stmt = db.prepare(
      "INSERT INTO ref_images (id, project_id, vault_key, label, file_hash, mime, bytes, owner_type, owner_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )

    const saved: string[] = []
    for (const item of incoming) {
      rejectIfBinary(item as Record<string, unknown>)

      const vaultKey = typeof item.vaultKey === "string" ? item.vaultKey.trim() : ""
      const fileHash = typeof item.fileHash === "string" ? item.fileHash.trim() : ""
      const ownerType = item.ownerType === "shot" ? "shot" : "character"
      const ownerId = typeof item.ownerId === "string" ? item.ownerId.trim() : ""
      if (!vaultKey) throw new InputError("缺少 vaultKey")
      if (!fileHash) throw new InputError("缺少 fileHash（图片指纹）")
      if (!ownerId) throw new InputError("缺少 ownerId")

      const id = randomUUID()
      stmt.run(
        id, projectId, vaultKey,
        typeof item.label === "string" ? item.label.slice(0, 100) : "未命名",
        fileHash,
        typeof item.mime === "string" ? item.mime : "image/png",
        Number.isFinite(Number(item.bytes)) ? Number(item.bytes) : 0,
        ownerType, ownerId, Date.now(),
      )
      saved.push(id)
    }

    return NextResponse.json(ok({ refs: listRefs(db, projectId), saved }))
  } catch (error) {
    const { body, status } = errorResponse(error)
    return NextResponse.json(body, { status })
  }
}

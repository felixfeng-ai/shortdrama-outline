import { createHash, randomUUID } from "node:crypto"

import { InputError, errorResponse, ok } from "@/lib/api"
import { assertProjectAccess } from "@/lib/assets/access"
import { latestSnapshot } from "@/lib/assets/repo"
import { getDbForRequest } from "@/lib/assets/store"
import type { Shot } from "@/lib/assets/types"
import { resolveProjectOwner, resolveRequestIdentity } from "@/lib/auth/request"
import {
  removeGeneratedAsset,
  resolveGeneratedStoragePath,
  writeGeneratedVideo,
} from "@/lib/generation/files"
import {
  completeGenerationTask,
  createGenerationTask,
  saveGeneratedAsset,
  selectGeneratedAsset,
} from "@/lib/generation/repo"
import { enforceApiRateLimit } from "@/lib/security/api-rate-limit"
import { probeMedia } from "@/lib/video/render-engine"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MAX_VIDEO_BYTES = 80 * 1024 * 1024
const MIN_VIDEO_MS = 1_000
const MAX_VIDEO_MS = 15_000
const MAX_BATCH_FILES = 20

function requiredString(value: FormDataEntryValue | null, message: string): string {
  const text = typeof value === "string" ? value.trim() : ""
  if (!text) throw new InputError(message)
  return text
}

function hasMp4Header(bytes: Uint8Array): boolean {
  // MIME 由客户端提供，必须再检查 ISO BMFF 的 ftyp box，防止任意文件伪装成 MP4。
  return bytes.length >= 12
    && String.fromCharCode(...bytes.slice(4, 8)) === "ftyp"
}

function findShot(db: ReturnType<typeof getDbForRequest>, projectId: string, id: string): Shot {
  const snapshot = latestSnapshot(db, projectId, "shots")
  const shots = Array.isArray(snapshot?.payload) ? snapshot.payload as Shot[] : []
  const shot = shots.find((item) => item.id === id || item.entityId === id)
  if (!shot) throw new InputError("镜头不存在或不属于当前项目")
  return shot
}

async function importOneVideo(
  db: ReturnType<typeof getDbForRequest>,
  projectId: string,
  shot: Shot,
  file: File,
) {
  let storedKey = ""
  let assetPersisted = false
  try {
    const targetId = shot.entityId ?? shot.id
    if (file.type.trim().toLowerCase() !== "video/mp4") {
      throw new InputError("当前只支持 MP4 视频")
    }
    if (file.size <= 0) throw new InputError("视频文件不能为空")
    if (file.size > MAX_VIDEO_BYTES) throw new InputError("视频文件不能超过 80MB")

    const bytes = new Uint8Array(await file.arrayBuffer())
    if (!hasMp4Header(bytes)) throw new InputError("视频内容不是有效的 MP4 文件")
    const fileId = randomUUID()
    const stored = writeGeneratedVideo(projectId, `${fileId}-external`, bytes, "video/mp4")
    storedKey = stored.storageKey
    const probe = await probeMedia(resolveGeneratedStoragePath(stored.storageKey))
      .catch(() => {
        throw new InputError("无法读取视频时长或画面尺寸")
      })
    if (
      probe.durationMs === null
      || probe.durationMs < MIN_VIDEO_MS
      || probe.durationMs > MAX_VIDEO_MS
    ) {
      throw new InputError("外部视频时长需在 1～15 秒之间")
    }
    if (!probe.width || !probe.height) throw new InputError("无法读取视频画面尺寸")

    const task = createGenerationTask(db, {
      projectId,
      targetType: "shot",
      targetId,
      providerId: "external-upload",
      model: "external-video",
      prompt: "external-video-import",
      mediaKind: "video",
      estimatedCostMicros: 0,
      actualCostMicros: 0,
      quotaUnits: 0,
      request: {
        source: "external-upload",
        originalName: file.name.slice(0, 180),
      },
    })
    const asset = saveGeneratedAsset(db, {
      taskId: task.id,
      projectId,
      targetType: "shot",
      targetId,
      storageKey: stored.storageKey,
      mime: "video/mp4",
      bytes: stored.bytes,
      providerId: "external-upload",
      model: "external-video",
      prompt: task.prompt,
      mediaKind: "video",
      durationMs: probe.durationMs,
      width: probe.width,
      height: probe.height,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      generationMeta: {
        source: "external-upload",
        originalName: file.name.slice(0, 180),
      },
    })
    assetPersisted = true
    completeGenerationTask(db, task.id, asset.id)
    const selected = selectGeneratedAsset(db, projectId, asset.id)
    return {
      asset: selected,
      shot: {
        id: shot.id,
        episode: shot.episode,
        shot: shot.shot,
      },
    }
  } catch (error) {
    if (storedKey && !assetPersisted) removeGeneratedAsset(storedKey)
    throw error
  }
}

interface BatchMapping {
  fileIndex: number
  shotId: string
}

function parseBatchMapping(value: FormDataEntryValue | null): BatchMapping[] {
  const raw = typeof value === "string" ? value : ""
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new InputError("批量导入 mapping 格式错误")
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new InputError("批量导入缺少文件映射")
  }
  if (parsed.length > MAX_BATCH_FILES) {
    throw new InputError(`一次最多导入 ${MAX_BATCH_FILES} 个视频`)
  }
  const seenIndexes = new Set<number>()
  return parsed.map((item) => {
    const record = item && typeof item === "object"
      ? item as Record<string, unknown>
      : {}
    const fileIndex = Number(record.fileIndex)
    const shotId = typeof record.shotId === "string" ? record.shotId.trim() : ""
    if (!Number.isInteger(fileIndex) || fileIndex < 0 || !shotId) {
      throw new InputError("批量导入 mapping 包含非法项")
    }
    if (seenIndexes.has(fileIndex)) throw new InputError("批量导入文件索引重复")
    seenIndexes.add(fileIndex)
    return { fileIndex, shotId }
  })
}

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const db = getDbForRequest()
  try {
    const projectId = (await context.params).id
    const ownerId = resolveProjectOwner(db, req)
    const identity = resolveRequestIdentity(db, req)
    enforceApiRateLimit(db, req, "import", { identity })
    assertProjectAccess(db, projectId, ownerId)

    const form = await req.formData().catch(() => null)
    if (!form) throw new InputError("缺少视频上传内容")
    const batchFiles = form.getAll("files").filter((item): item is File => item instanceof File)
    if (batchFiles.length > 0) {
      const mapping = parseBatchMapping(form.get("mapping"))
      if (batchFiles.length > MAX_BATCH_FILES) {
        throw new InputError(`一次最多导入 ${MAX_BATCH_FILES} 个视频`)
      }
      const assets: Array<{ asset: unknown; shot: unknown }> = []
      const failures: Array<{ fileIndex: number; fileName: string; error: string }> = []
      for (const item of mapping) {
        const file = batchFiles[item.fileIndex]
        if (!file) throw new InputError("批量导入文件索引越界")
        try {
          const shot = findShot(db, projectId, item.shotId)
          assets.push(await importOneVideo(db, projectId, shot, file))
        } catch (error) {
          failures.push({
            fileIndex: item.fileIndex,
            fileName: file.name,
            error: error instanceof Error ? error.message : "外部视频导入失败",
          })
        }
      }
      return Response.json(ok({
        assets,
        failures,
        importedCount: assets.length,
      }))
    }

    const shotId = requiredString(form.get("shotId"), "缺少镜头 id")
    const shot = findShot(db, projectId, shotId)
    const file = form.get("file")
    if (!(file instanceof File)) throw new InputError("缺少视频文件")
    const imported = await importOneVideo(db, projectId, shot, file)
    return Response.json(ok(imported))
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return Response.json(body, { status, headers })
  }
}

import { NextResponse } from "next/server"

import { InputError, errorResponse, isAbortError, ok } from "@/lib/api"
import { assertProjectAccess } from "@/lib/assets/access"
import { getDbForRequest } from "@/lib/assets/store"
import { latestSnapshot } from "@/lib/assets/repo"
import { placeGenerationTargetId } from "@/lib/assets/anchors"
import { resolveProjectOwner, resolveRequestIdentity } from "@/lib/auth/request"
import { readLook } from "@/lib/look"
import { enforceApiRateLimit } from "@/lib/security/api-rate-limit"
import {
  completeGenerationTask,
  cancelGenerationTask,
  createGenerationTask,
  failGenerationTask,
  listGeneratedAssets,
  listGenerationTasks,
  markGenerationTaskRunning,
  reconcileStaleGenerationTasks,
  saveGeneratedAsset,
  selectGeneratedAsset,
  type GenerationTargetType,
} from "@/lib/generation/repo"
import { readGeneratedImage, writeGeneratedImage } from "@/lib/generation/files"
import {
  getAliyunImageConfig,
  projectImageSeed,
  type AliyunReferenceImage,
} from "@/lib/generation/model"
import { withImageStyle } from "@/lib/generation/prompt"
import {
  selectGenerationReferenceCandidates,
  withGenerationReferenceInstructions,
  type GenerationReferenceCandidate,
} from "@/lib/generation/references"
import { runImageGeneration } from "@/lib/generation/service"
import { notifyGenerationFinished } from "@/lib/push/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

function targetType(value: unknown): GenerationTargetType {
  if (value === "character" || value === "place" || value === "shot") return value
  throw new InputError("生成目标类型不正确")
}

function requiredString(value: unknown, message: string): string {
  const text = typeof value === "string" ? value.trim() : ""
  if (!text) throw new InputError(message)
  return text
}

function hasTarget(
  db: ReturnType<typeof getDbForRequest>,
  projectId: string,
  type: GenerationTargetType,
  targetId: string,
): boolean {
  const kind = type === "character" ? "visualCharacters" : type === "place" ? "visualPlaces" : "shots"
  const snapshot = latestSnapshot(db, projectId, kind)
  if (!snapshot || !Array.isArray(snapshot.payload)) return false
  return snapshot.payload.some((item) => {
    if (!item || typeof item !== "object") return false
    const record = item as Record<string, unknown>
    return record.entityId === targetId ||
      record.id === targetId ||
      (type === "place" && typeof record.name === "string" && placeGenerationTargetId(record.name) === targetId)
  })
}

function httpError(message: string, status: number): Error {
  const error = new Error(message) as Error & { status: number }
  error.status = status
  return error
}

function loadReferenceImages(
  db: ReturnType<typeof getDbForRequest>,
  projectId: string,
  type: GenerationTargetType,
  targetId: string,
): { candidates: GenerationReferenceCandidate[]; images: AliyunReferenceImage[] } {
  const selected = selectGenerationReferenceCandidates({
    targetType: type,
    targetId,
    shots: latestSnapshot(db, projectId, "shots")?.payload ?? [],
    visualCharacters: latestSnapshot(db, projectId, "visualCharacters")?.payload ?? [],
    visualPlaces: latestSnapshot(db, projectId, "visualPlaces")?.payload ?? [],
    assets: listGeneratedAssets(db, projectId),
  })
  const candidates: GenerationReferenceCandidate[] = []
  const images: AliyunReferenceImage[] = []
  for (const candidate of selected) {
    try {
      const bytes = readGeneratedImage(candidate.asset.storageKey)
      if (bytes.length > 10 * 1024 * 1024) continue
      candidates.push(candidate)
      images.push({ bytes, mime: candidate.asset.mime })
    } catch {
      // A missing historical file should not block a fresh generation.
    }
  }
  return { candidates, images }
}

async function notifyGeneration(
  db: ReturnType<typeof getDbForRequest>,
  ownerId: string,
  input: {
    taskId: string
    targetType: GenerationTargetType
    status: "succeeded" | "failed"
    error?: string
  },
): Promise<void> {
  const send = notifyGenerationFinished(db, ownerId, input).catch(() => undefined)
  await Promise.race([
    send,
    new Promise<void>((resolve) => setTimeout(resolve, 2_000)),
  ])
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const projectId = requiredString(url.searchParams.get("projectId"), "缺少 projectId")
    const db = getDbForRequest()
    const ownerId = resolveProjectOwner(db, req)
    assertProjectAccess(db, projectId, ownerId)
    reconcileStaleGenerationTasks(db, projectId)

    const rawType = url.searchParams.get("targetType")
    const rawId = url.searchParams.get("targetId")
    const type = rawType ? targetType(rawType) : undefined
    const id = rawId?.trim() || undefined
    if ((type && !id) || (!type && id)) {
      throw new InputError("targetType 与 targetId 必须同时提供")
    }

    return NextResponse.json(ok({
      tasks: listGenerationTasks(db, projectId, type, id),
      assets: listGeneratedAssets(db, projectId, type, id),
    }))
  } catch (error) {
    const { body, status } = errorResponse(error)
    return NextResponse.json(body, { status })
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json().catch(() => null)
    const projectId = requiredString(body?.projectId, "缺少 projectId")
    const assetId = requiredString(body?.assetId, "缺少 assetId")
    const db = getDbForRequest()
    assertProjectAccess(db, projectId, resolveProjectOwner(db, req))
    const asset = selectGeneratedAsset(db, projectId, assetId)
    return NextResponse.json(ok({ asset }))
  } catch (error) {
    const { body, status } = errorResponse(error)
    return NextResponse.json(body, { status })
  }
}

export async function POST(req: Request) {
  let taskId: string | null = null
  let notification: {
    taskId: string
    targetType: GenerationTargetType
  } | null = null
  const db = getDbForRequest()
  const ownerId = resolveProjectOwner(db, req)
  try {
    enforceApiRateLimit(db, req, "image", {
      identity: resolveRequestIdentity(db, req),
    })
    const body = await req.json().catch(() => null)
    const projectId = requiredString(body?.projectId, "缺少 projectId")
    const type = targetType(body?.targetType)
    const targetId = requiredString(body?.targetId, "缺少生成目标 id")
    const prompt = requiredString(body?.prompt, "缺少图像提示词")
    const autoSelect = body?.autoSelect !== false
    const look = readLook(body?.look)
    const imageConfig = getAliyunImageConfig()
    const seed = projectImageSeed(projectId)

    assertProjectAccess(db, projectId, ownerId)
    if (!hasTarget(db, projectId, type, targetId)) {
      throw new InputError("当前角色、地点或镜头还没有保存到项目，请先生成对应步骤")
    }
    const references = loadReferenceImages(db, projectId, type, targetId)
    const generationModel = references.images.length > 0
      ? imageConfig.editModel
      : imageConfig.model
    const effectivePrompt = withGenerationReferenceInstructions(
      withImageStyle(prompt, look),
      references.candidates,
    )

    const task = createGenerationTask(db, {
      projectId,
      targetType: type,
      targetId,
      providerId: "aliyun",
      model: generationModel,
      prompt: effectivePrompt,
    })
    taskId = task.id
    notification = { taskId: task.id, targetType: type }
    markGenerationTaskRunning(db, task.id)

    const image = await runImageGeneration({
      prompt: effectivePrompt,
      aspect: body?.aspect,
      seed,
      referenceImages: references.images.length > 0 ? references.images : undefined,
      signal: req.signal,
    })
    const file = writeGeneratedImage(projectId, task.id, image.bytes, image.mime)
    const asset = saveGeneratedAsset(db, {
      taskId: task.id,
      projectId,
      targetType: type,
      targetId,
      storageKey: file.storageKey,
      mime: image.mime,
      bytes: file.bytes,
      providerId: "aliyun",
      model: generationModel,
      prompt: effectivePrompt,
    })
    if (autoSelect) selectGeneratedAsset(db, projectId, asset.id)
    const completed = completeGenerationTask(db, task.id, asset.id)
    await notifyGeneration(db, ownerId, {
      ...notification,
      status: "succeeded",
    })
    return NextResponse.json(ok({
      task: completed,
      asset: autoSelect ? selectGeneratedAsset(db, projectId, asset.id) : asset,
      referenceCount: references.images.length,
    }))
  } catch (error) {
    const message = error instanceof Error ? error.message : "生成失败，请重试"
    if (taskId) {
      try {
        if (req.signal.aborted || isAbortError(error)) {
          cancelGenerationTask(db, taskId, "已停止等待")
        } else {
          failGenerationTask(db, taskId, message)
          if (notification) {
            await notifyGeneration(db, ownerId, {
              ...notification,
              status: "failed",
              error: message,
            })
          }
        }
      } catch { /* 已有终态时忽略 */ }
    }
    if (req.signal.aborted || isAbortError(error)) {
      return NextResponse.json({ success: false, data: null, error: "已停止等待" }, { status: 499 })
    }
    if (error instanceof InputError || (error instanceof Error && "status" in error)) {
      const { body, status, headers } = errorResponse(error)
      return NextResponse.json(body, { status, headers })
    }
    const safe = httpError(message || "图像生成失败，请重试", 502)
    const { body, status, headers } = errorResponse(safe)
    return NextResponse.json(body, { status, headers })
  }
}

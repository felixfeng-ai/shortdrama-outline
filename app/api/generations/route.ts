import { NextResponse } from "next/server"

import { InputError, errorResponse, ok } from "@/lib/api"
import { assertProjectAccess } from "@/lib/assets/access"
import { getDbForRequest } from "@/lib/assets/store"
import { latestSnapshot } from "@/lib/assets/repo"
import { ownerFromRequest } from "@/lib/session"
import { readLook } from "@/lib/look"
import {
  completeGenerationTask,
  createGenerationTask,
  failGenerationTask,
  listGeneratedAssets,
  listGenerationTasks,
  markGenerationTaskRunning,
  saveGeneratedAsset,
  selectGeneratedAsset,
  type GenerationTargetType,
} from "@/lib/generation/repo"
import { writeGeneratedImage } from "@/lib/generation/files"
import { getAliyunImageConfig, projectImageSeed } from "@/lib/generation/model"
import { withImageStyle } from "@/lib/generation/prompt"
import { runImageGeneration } from "@/lib/generation/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 180

function targetType(value: unknown): GenerationTargetType {
  if (value === "character" || value === "shot") return value
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
  const kind = type === "character" ? "visualCharacters" : "shots"
  const snapshot = latestSnapshot(db, projectId, kind)
  if (!snapshot || !Array.isArray(snapshot.payload)) return false
  return snapshot.payload.some((item) => {
    if (!item || typeof item !== "object") return false
    const record = item as Record<string, unknown>
    return record.entityId === targetId || record.id === targetId
  })
}

function httpError(message: string, status: number): Error {
  const error = new Error(message) as Error & { status: number }
  error.status = status
  return error
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const projectId = requiredString(url.searchParams.get("projectId"), "缺少 projectId")
    const db = getDbForRequest()
    const ownerId = ownerFromRequest(req)
    assertProjectAccess(db, projectId, ownerId)

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
    assertProjectAccess(db, projectId, ownerFromRequest(req))
    const asset = selectGeneratedAsset(db, projectId, assetId)
    return NextResponse.json(ok({ asset }))
  } catch (error) {
    const { body, status } = errorResponse(error)
    return NextResponse.json(body, { status })
  }
}

export async function POST(req: Request) {
  let taskId: string | null = null
  const db = getDbForRequest()
  try {
    const body = await req.json().catch(() => null)
    const projectId = requiredString(body?.projectId, "缺少 projectId")
    const type = targetType(body?.targetType)
    const targetId = requiredString(body?.targetId, "缺少生成目标 id")
    const prompt = requiredString(body?.prompt, "缺少图像提示词")
    const look = readLook(body?.look)
    const effectivePrompt = withImageStyle(prompt, look)
    const imageConfig = getAliyunImageConfig()
    const seed = projectImageSeed(projectId)

    assertProjectAccess(db, projectId, ownerFromRequest(req))
    if (!hasTarget(db, projectId, type, targetId)) {
      throw new InputError("当前角色或镜头还没有保存到项目，请先生成对应步骤")
    }

    const task = createGenerationTask(db, {
      projectId,
      targetType: type,
      targetId,
      providerId: "aliyun",
      model: imageConfig.model,
      prompt: effectivePrompt,
    })
    taskId = task.id
    markGenerationTaskRunning(db, task.id)

    const image = await runImageGeneration({
      prompt: effectivePrompt,
      aspect: body?.aspect,
      seed,
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
      model: imageConfig.model,
      prompt: effectivePrompt,
    })
    selectGeneratedAsset(db, projectId, asset.id)
    const completed = completeGenerationTask(db, task.id, asset.id)
    return NextResponse.json(ok({ task: completed, asset: selectGeneratedAsset(db, projectId, asset.id) }))
  } catch (error) {
    const message = error instanceof Error ? error.message : "生成失败，请重试"
    if (taskId) {
      try { failGenerationTask(db, taskId, message) } catch { /* 已有终态时忽略 */ }
    }
    if (error instanceof InputError || (error instanceof Error && "status" in error)) {
      const { body, status } = errorResponse(error)
      return NextResponse.json(body, { status })
    }
    const safe = httpError(message || "图像生成失败，请重试", 502)
    const { body, status } = errorResponse(safe)
    return NextResponse.json(body, { status })
  }
}

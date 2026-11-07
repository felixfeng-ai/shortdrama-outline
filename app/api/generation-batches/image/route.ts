import { randomUUID } from "node:crypto"
import { NextResponse } from "next/server"

import { InputError, errorResponse, ok } from "@/lib/api"
import { assertProjectAccess } from "@/lib/assets/access"
import { getDbForRequest } from "@/lib/assets/store"
import { resolveProjectOwner, resolveRequestIdentity } from "@/lib/auth/request"
import { resolveImageAspect } from "@/lib/generation/model"
import {
  enqueueImageBatch,
  type ImageBatchTargetInput,
} from "@/lib/generation/image-batch"
import { ensureImageQueueWorker } from "@/lib/generation/image-queue"
import { readLook } from "@/lib/look"
import { enforceApiRateLimit } from "@/lib/security/api-rate-limit"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function text(value: unknown, field: string): string {
  const result = typeof value === "string" ? value.trim() : ""
  if (!result) throw new InputError(`${field}不能为空`)
  return result
}

export async function POST(req: Request) {
  try {
    const db = getDbForRequest()
    const identity = resolveRequestIdentity(db, req)
    // 整个批次只计一次短时限流；后续图片由服务端 Worker 统一调度。
    enforceApiRateLimit(db, req, "image", { identity })
    const body = await req.json().catch(() => null)
    const projectId = text(body?.projectId, "projectId")
    const ownerId = resolveProjectOwner(db, req)
    assertProjectAccess(db, projectId, ownerId)
    const rawTargets = Array.isArray(body?.targets) ? body.targets : []
    const targets: ImageBatchTargetInput[] = rawTargets.map((item: unknown, index: number) => {
      if (!item || typeof item !== "object") throw new InputError("批量目标格式不正确")
      const target = item as Record<string, unknown>
      if (target.targetType !== "character" && target.targetType !== "place" && target.targetType !== "shot") {
        throw new InputError(`targets[${index}].targetType 不正确`)
      }
      return {
        key: text(target.key, `targets[${index}].key`),
        name: text(target.name, `targets[${index}].name`),
        targetType: target.targetType as ImageBatchTargetInput["targetType"],
        targetId: text(target.targetId, `targets[${index}].targetId`),
        prompt: text(target.prompt, `targets[${index}].prompt`),
        aspect: resolveImageAspect(target.aspect),
      }
    })
    const state = enqueueImageBatch(db, {
      projectId,
      identity,
      targets,
      look: readLook(body?.look),
      idempotencyKey: text(body?.idempotencyKey, "idempotencyKey")
        || randomUUID(),
      priority: Number.isFinite(Number(body?.priority)) ? Number(body.priority) : 0,
      concurrency: Number.isFinite(Number(body?.concurrency)) ? Number(body.concurrency) : 2,
    })
    ensureImageQueueWorker(db)
    return NextResponse.json(ok(state), { status: 202 })
  } catch (error) {
    const safe = error instanceof InputError || (
      error instanceof Error && "status" in error && typeof error.status === "number"
    )
      ? error
      : new InputError(error instanceof Error ? error.message : "图像批次创建失败")
    const { body, status, headers } = errorResponse(safe)
    return NextResponse.json(body, { status, headers })
  }
}

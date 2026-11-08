import { NextResponse } from "next/server"

import { errorResponse, InputError, ok } from "@/lib/api"
import { assertProjectAccess } from "@/lib/assets/access"
import { getDbForRequest } from "@/lib/assets/store"
import { resolveProjectOwner, resolveRequestIdentity } from "@/lib/auth/request"
import { AGENT_COMMAND_KINDS, applyAgentCommand, type AgentCommandKind } from "@/lib/agent/commands"
import { enforceApiRateLimit, type ApiRateLimitGroup } from "@/lib/security/api-rate-limit"
import { ensureImageQueueWorker } from "@/lib/generation/image-queue"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function isCommand(value: unknown): value is AgentCommandKind {
  return typeof value === "string"
    && AGENT_COMMAND_KINDS.includes(value as AgentCommandKind)
}

function strategy(command: AgentCommandKind): ApiRateLimitGroup {
  if (command === "image-batch") return "image"
  if (command === "canvas-action") return "material"
  return "model"
}

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const db = getDbForRequest()
    const { id: projectId } = await context.params
    const ownerId = resolveProjectOwner(db, req)
    assertProjectAccess(db, projectId, ownerId)
    const body = await req.json().catch(() => null)
    if (body?.confirmed !== true) throw new InputError("需要用户确认后才能执行")
    if (!isCommand(body?.command)) throw new InputError("不支持的 Agent 命令")
    const identity = resolveRequestIdentity(db, req)
    enforceApiRateLimit(db, req, strategy(body.command), { identity })
    const result = await applyAgentCommand(db, {
      projectId,
      ownerId,
      identity,
      command: body.command,
      payload: body.payload && typeof body.payload === "object"
        ? body.payload as Record<string, unknown>
        : {},
    })
    if (body.command === "image-batch") ensureImageQueueWorker(db)
    return NextResponse.json(ok({ result }), {
      headers: { "cache-control": "no-store" },
    })
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

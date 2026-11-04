import { NextResponse } from "next/server"

import { errorResponse } from "@/lib/api"
import { assertProjectAccess } from "@/lib/assets/access"
import { getSnapshot, latestSnapshot } from "@/lib/assets/repo"
import { getDbForRequest } from "@/lib/assets/store"
import { resolveProjectOwner, resolveRequestIdentity } from "@/lib/auth/request"
import { parseJson, streamChat } from "@/lib/deepseek"
import { episodeQuotaUnits } from "@/lib/episodes"
import { chargeQuota } from "@/lib/quota"
import { enforceApiRateLimit } from "@/lib/security/api-rate-limit"
import {
  buildLocalizationPrompt,
  buildLocalizationSignature,
  normalizeLocalizedEpisodes,
  type LocalizationSourceEpisode,
} from "@/lib/localization/adapt"
import {
  getBranchContext,
  listGlossary,
} from "@/lib/localization/context"
import {
  loadLocalizationRun,
  saveLocalizationRun,
} from "@/lib/localization/runs"

export const runtime = "nodejs"
export const maxDuration = 600

type RouteContext = {
  params: { id: string; branchId: string } | Promise<{ id: string; branchId: string }>
}

export async function POST(req: Request, context: RouteContext) {
  let projectId = ""
  let branchId = ""
  let sourceSnapshotId = ""
  let ownerId = ""
  let resume = false
  try {
    const body = await req.json().catch(() => null)
    const db = getDbForRequest()
    ownerId = resolveProjectOwner(db, req)
    const params = await context.params
    projectId = params.id
    branchId = params.branchId
    assertProjectAccess(db, projectId, ownerId)
    resume = body?.resume === true
    sourceSnapshotId = typeof body?.sourceSnapshotId === "string"
      ? body.sourceSnapshotId
      : latestSnapshot(db, projectId, "episodes")?.id ?? ""
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }

  const db = getDbForRequest()
  const contextData = getBranchContext(db, projectId, branchId, ownerId)
  if (!contextData) {
    return NextResponse.json(
      { success: false, data: null, error: "请先保存目标市场与本地化上下文" },
      { status: 400 },
    )
  }
  const source = sourceSnapshotId ? getSnapshot(db, sourceSnapshotId) : null
  if (
    !sourceSnapshotId
    || !source
    || source.projectId !== projectId
    || source.kind !== "episodes"
    || source.branchId
  ) {
    return NextResponse.json(
      { success: false, data: null, error: "当前项目还没有可本地化的分集快照" },
      { status: 400 },
    )
  }
  const sourceEpisodes: LocalizationSourceEpisode[] = Array.isArray(source.payload)
    ? source.payload.map((episode) => {
      const row = episode as Record<string, unknown>
      return {
        episode: Number(row.number) || 0,
        title: String(row.title ?? ""),
        synopsis: String(row.synopsis ?? ""),
        hook: String(row.hook ?? ""),
      }
    }).filter((episode) => episode.episode > 0)
    : []
  if (sourceEpisodes.length === 0) {
    return NextResponse.json(
      { success: false, data: null, error: "分集快照里没有可本地化的内容" },
      { status: 400 },
    )
  }
  const glossary = listGlossary(db, projectId, branchId, ownerId)
  const prompt = buildLocalizationPrompt({ context: contextData, glossary, episodes: sourceEpisodes })
  const signature = buildLocalizationSignature({
    projectId,
    branchId,
    sourceSnapshotId,
    contextVersion: contextData.version,
    sourceEpisodes,
    glossary,
  })
  const checkpoint = resume ? loadLocalizationRun<{ items?: unknown }>(db, projectId, branchId, signature) : null
  const resumedItems = checkpoint?.state?.items
    ? normalizeLocalizedEpisodes({ items: checkpoint.state.items })
    : []

  const identity = resolveRequestIdentity(db, req)
  try {
    enforceApiRateLimit(db, req, "model", { identity })
    chargeQuota(
      db,
      identity,
      "episodes",
      Date.now(),
      Math.max(1, Math.ceil(episodeQuotaUnits(sourceEpisodes.length) / 2)),
    )
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false
      const send = (event: string, data: unknown) => {
        if (closed) return
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }
      const finish = () => {
        if (closed) return
        closed = true
        controller.close()
      }
      try {
        if (checkpoint) {
          send("resume", { cursor: checkpoint.cursor, items: resumedItems })
        }
        let buffer = ""
        let lastSent = 0
        for await (const delta of streamChat(prompt.system, prompt.user, {
          temperature: 0.6,
          maxTokens: Math.min(30_000, Math.max(4_000, sourceEpisodes.length * 1_200)),
          signal: req.signal,
        })) {
          buffer += delta
          if (buffer.length - lastSent >= 400) {
            lastSent = buffer.length
            send("progress", { characters: buffer.length })
          }
        }
        const items = normalizeLocalizedEpisodes(parseJson(buffer))
        saveLocalizationRun(db, {
          id: checkpoint?.id ?? `localization_run_${Date.now()}`,
          projectId,
          branchId,
          ownerId,
          sourceSnapshotId,
          signature,
          cursor: sourceEpisodes.length,
          state: { items },
          status: "done",
        })
        send("done", { items, signature })
        finish()
      } catch (error) {
        const { body } = errorResponse(error)
        send("error", {
          error: body.error,
          resume: { available: true, signature },
        })
        finish()
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}

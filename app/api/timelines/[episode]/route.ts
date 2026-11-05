import { NextResponse } from "next/server"

import { InputError, errorResponse, ok } from "@/lib/api"
import { assertProjectAccess } from "@/lib/assets/access"
import { getDbForRequest } from "@/lib/assets/store"
import { resolveProjectOwner } from "@/lib/auth/request"
import {
  getTimelineDraft,
  initializeEpisodeTimeline,
  listTimelineVersions,
} from "@/lib/timeline/repo"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteContext = { params: { episode: string } | Promise<{ episode: string }> }

function requiredString(value: unknown, message: string): string {
  const text = typeof value === "string" ? value.trim() : ""
  if (!text) throw new InputError(message)
  return text
}

function episodeFrom(value: string): number {
  const episode = Number(value)
  if (!Number.isInteger(episode) || episode < 0 || episode > 9999) {
    throw new InputError("集号不正确")
  }
  return episode
}

export async function GET(req: Request, context: RouteContext) {
  try {
    const url = new URL(req.url)
    const projectId = requiredString(url.searchParams.get("projectId"), "缺少 projectId")
    const params = await context.params
    const episode = episodeFrom(params.episode)
    const db = getDbForRequest()
    assertProjectAccess(db, projectId, resolveProjectOwner(db, req))
    return NextResponse.json(ok({
      draft: getTimelineDraft(db, projectId, episode),
      versions: listTimelineVersions(db, projectId, episode),
    }), { headers: { "cache-control": "no-store" } })
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

export async function POST(req: Request, context: RouteContext) {
  try {
    const body = await req.json().catch(() => null)
    const projectId = requiredString(body?.projectId, "缺少 projectId")
    const params = await context.params
    const episode = episodeFrom(params.episode)
    const db = getDbForRequest()
    assertProjectAccess(db, projectId, resolveProjectOwner(db, req))
    return NextResponse.json(ok(
      initializeEpisodeTimeline(db, projectId, episode),
    ), { headers: { "cache-control": "no-store" } })
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

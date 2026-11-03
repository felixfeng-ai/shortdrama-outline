import { NextResponse } from "next/server"

import { InputError, errorResponse, ok } from "@/lib/api"
import { assertProjectAccess } from "@/lib/assets/access"
import { latestSnapshot } from "@/lib/assets/repo"
import { getDbForRequest } from "@/lib/assets/store"
import type {
  Shot,
  VisualCharacter,
  VisualPlace,
} from "@/lib/assets/types"
import { resolveProjectOwner } from "@/lib/auth/request"
import { listGeneratedAssets } from "@/lib/generation/repo"
import { buildContinuityReport } from "@/lib/skills/continuity"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function requiredString(value: unknown, message: string): string {
  const text = typeof value === "string" ? value.trim() : ""
  if (!text) throw new InputError(message)
  return text
}

function snapshotArray<T>(
  db: ReturnType<typeof getDbForRequest>,
  projectId: string,
  kind: "shots" | "visualCharacters" | "visualPlaces",
): { payload: T[]; snapshotId: string | null } {
  const snapshot = latestSnapshot(db, projectId, kind)
  return {
    payload: Array.isArray(snapshot?.payload) ? snapshot.payload as T[] : [],
    snapshotId: snapshot?.id ?? null,
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)
    const projectId = requiredString(body?.projectId, "缺少 projectId")
    const db = getDbForRequest()
    const ownerId = resolveProjectOwner(db, req)
    assertProjectAccess(db, projectId, ownerId)

    const shots = snapshotArray<Shot>(db, projectId, "shots")
    const visuals = snapshotArray<VisualCharacter>(db, projectId, "visualCharacters")
    const places = snapshotArray<VisualPlace>(db, projectId, "visualPlaces")
    const report = buildContinuityReport({
      projectId,
      shots: shots.payload,
      visuals: visuals.payload,
      places: places.payload,
      assets: listGeneratedAssets(db, projectId),
      sourceSnapshotIds: {
        shots: shots.snapshotId,
        visualCharacters: visuals.snapshotId,
        visualPlaces: places.snapshotId,
      },
    })

    return NextResponse.json(ok({ report }), {
      headers: { "cache-control": "no-store" },
    })
  } catch (error) {
    const { body, status } = errorResponse(error)
    return NextResponse.json(body, { status })
  }
}

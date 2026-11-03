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
import {
  buildCostSkillReport,
  buildDeliverySkillReport,
  type DeterministicSkillId,
} from "@/lib/skills/deterministic"

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
): T[] {
  const snapshot = latestSnapshot(db, projectId, kind)
  return Array.isArray(snapshot?.payload) ? snapshot.payload as T[] : []
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)
    const projectId = requiredString(body?.projectId, "缺少 projectId")
    const skill = requiredString(body?.skill, "缺少 Skill 标识") as DeterministicSkillId
    if (skill !== "delivery" && skill !== "cost") {
      throw new InputError("该 Skill 没有确定性 Runner")
    }
    const db = getDbForRequest()
    const ownerId = resolveProjectOwner(db, req)
    const project = assertProjectAccess(db, projectId, ownerId)
    const shots = snapshotArray<Shot>(db, projectId, "shots")
    const report = skill === "delivery"
      ? buildDeliverySkillReport({
        projectTitle: project.title,
        shots,
        visuals: snapshotArray<VisualCharacter>(db, projectId, "visualCharacters"),
        places: snapshotArray<VisualPlace>(db, projectId, "visualPlaces"),
      })
      : buildCostSkillReport({
        projectTitle: project.title,
        shots,
      })

    return NextResponse.json(ok({ report }), {
      headers: { "cache-control": "no-store" },
    })
  } catch (error) {
    const { body, status } = errorResponse(error)
    return NextResponse.json(body, { status })
  }
}

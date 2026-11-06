import { createHash } from "node:crypto"
import type { DatabaseSync } from "node:sqlite"

import { getProjectCanon } from "../assets/canon.ts"
import { listProjectMaterials } from "../assets/materials.ts"
import { getProjectContext } from "../assets/project-context.ts"
import { getProject, latestSnapshot } from "../assets/repo.ts"
import type { Act, Character, Episode } from "../types.ts"
import type { Scene, Shot, VisualCharacter, VisualPlace } from "../assets/types.ts"
import type { NovelSourcePack } from "./types.ts"

/** 从小说的角度只保留“发生了什么、谁说了什么”，不复制镜头执行参数。 */
function narrativeShots(value: unknown): NovelSourcePack["shots"] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const shot = item as Partial<Shot>
    const action = typeof shot.action === "string" ? shot.action.trim() : ""
    const dialogue = typeof shot.dialogue === "string" ? shot.dialogue.trim() : ""
    if (!action && !dialogue) return []
    return [{
      id: String(shot.id ?? shot.entityId ?? ""),
      episode: Number(shot.episode) || 0,
      scene: String(shot.scene ?? ""),
      action,
      speaker: String(shot.speaker ?? ""),
      dialogue,
      characters: Array.isArray(shot.characters)
        ? shot.characters.filter((name): name is string => typeof name === "string")
        : [],
    }]
  })
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : []
}

function ideaText(value: unknown): string {
  if (typeof value === "string") return value.trim()
  if (!value || typeof value !== "object") return ""
  const row = value as Record<string, unknown>
  return [row.text, row.idea, row.title]
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .join(" · ")
    .trim()
}

export function buildNovelSourcePack(db: DatabaseSync, projectId: string): NovelSourcePack {
  const project = getProject(db, projectId)
  if (!project) {
    const error = new Error("项目不存在或无权访问") as Error & { status: number }
    error.status = 403
    throw error
  }
  const context = getProjectContext(db, projectId)
  const snapshots = {
    idea: latestSnapshot(db, projectId, "idea"),
    characters: latestSnapshot(db, projectId, "characters"),
    acts: latestSnapshot(db, projectId, "acts"),
    episodes: latestSnapshot(db, projectId, "episodes"),
    visualCharacters: latestSnapshot(db, projectId, "visualCharacters"),
    scenes: latestSnapshot(db, projectId, "scenes"),
    visualPlaces: latestSnapshot(db, projectId, "visualPlaces"),
    shots: latestSnapshot(db, projectId, "shots"),
  }
  const canon = getProjectCanon(db, projectId)
  const materials = listProjectMaterials(db, projectId)
  const sourceSnapshotIds = Object.values(snapshots)
    .filter((snapshot): snapshot is NonNullable<typeof snapshot> => snapshot !== null)
    .map((snapshot) => snapshot.id)
  const sourceVersions = Object.fromEntries(
    Object.entries(snapshots)
      .filter((entry): entry is [string, NonNullable<(typeof snapshots)[keyof typeof snapshots]>] =>
        entry[1] !== null)
      .map(([kind, snapshot]) => [kind, snapshot.version]),
  )
  const pack: Omit<NovelSourcePack, "signature"> = {
    projectId,
    title: project.title,
    idea: ideaText(snapshots.idea?.payload),
    brief: context?.brief ?? {
      premise: "",
      payoff: "",
      destination: "",
      emotion: "",
      audience: "",
      references: "",
      redline: "",
    },
    look: context?.look ?? { palette: "", light: "", lens: "", banned: "" },
    characters: asArray<Character>(snapshots.characters?.payload),
    acts: asArray<Act>(snapshots.acts?.payload),
    episodes: asArray<Episode>(snapshots.episodes?.payload),
    scenes: asArray<Scene>(snapshots.scenes?.payload),
    shots: narrativeShots(snapshots.shots?.payload),
    visualCharacters: asArray<VisualCharacter>(snapshots.visualCharacters?.payload),
    visualPlaces: asArray<VisualPlace>(snapshots.visualPlaces?.payload),
    canonFacts: canon.facts.map((fact) => ({
      entityName: fact.entityName,
      entityKind: fact.entityKind,
      field: fact.field,
      value: fact.value,
      validFromEpisode: fact.validFromEpisode,
      validToEpisode: fact.validToEpisode,
    })),
    materialExcerpts: materials.map((material) => material.content.slice(0, 4_000)),
    sourceSnapshotIds,
    sourceVersions,
    capturedAt: Date.now(),
  }
  const signature = createHash("sha256")
    .update(JSON.stringify({
      snapshots: sourceVersions,
      idea: pack.idea,
      brief: pack.brief,
      look: pack.look,
      characters: pack.characters,
      acts: pack.acts,
      episodes: pack.episodes,
      scenes: pack.scenes,
      shots: pack.shots,
      canonFacts: pack.canonFacts,
      materials: pack.materialExcerpts,
    }))
    .digest("hex")
  return { ...pack, signature }
}

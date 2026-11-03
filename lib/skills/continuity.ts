import {
  auditShotProduction,
  type ShotQcCode,
} from "../assets/qc.ts"
import type {
  Shot,
  ShotStatus,
  VisualCharacter,
  VisualPlace,
} from "../assets/types.ts"
import type { GeneratedAsset } from "../generation/types.ts"

export type ContinuitySeverity = "blocking" | "warning"

export const CONTINUITY_ACTIONS = {
  "missing-anchor": "补齐角色 / 地点锚点",
  "locked-trait": "补齐禁改项",
  "missing-reference": "补齐缺失参考图",
  "invalid-duration": "改为 5 秒或 10 秒",
  "stale-reference": "重选参考并重做镜头",
} as const satisfies Record<ShotQcCode, string>

export interface ContinuityIssue {
  code: ShotQcCode
  severity: ContinuitySeverity
  shotId: string
  entityId: string
  episode: number
  shot: number
  scene: string
  status: ShotStatus
  character?: string
  message: string
  action: string
}

export interface ContinuityRepairItem {
  shotId: string
  entityId: string
  episode: number
  shot: number
  scene: string
  status: ShotStatus
  actions: string[]
  reasons: string[]
  issueCodes: ShotQcCode[]
}

export interface ContinuityReport {
  projectId: string
  readOnly: true
  writes: false
  modelCalls: 0
  quotaCharged: 0
  sourceSnapshotIds: {
    shots: string | null
    visualCharacters: string | null
    visualPlaces: string | null
  }
  summary: {
    totalShots: number
    issueShots: number
    cleanShots: number
    issueCount: number
    episodesWithIssues: number
    byCode: Record<ShotQcCode, number>
  }
  issues: ContinuityIssue[]
  repairQueue: ContinuityRepairItem[]
}

export interface ContinuityInput {
  projectId: string
  shots: Shot[]
  visuals: VisualCharacter[]
  places: VisualPlace[]
  assets: GeneratedAsset[]
  sourceSnapshotIds?: Partial<ContinuityReport["sourceSnapshotIds"]>
}

function severityFor(code: ShotQcCode): ContinuitySeverity {
  if (code === "missing-reference" || code === "stale-reference" || code === "invalid-duration") {
    return "blocking"
  }
  return "warning"
}

function episodeRank(episode: number): number {
  return episode > 0 ? episode : Number.MAX_SAFE_INTEGER
}

function sortByEpisodeAndShot<T extends { episode: number; shot: number }>(left: T, right: T): number {
  return episodeRank(left.episode) - episodeRank(right.episode) || left.shot - right.shot
}

export function buildContinuityReport(input: ContinuityInput): ContinuityReport {
  const qc = auditShotProduction({
    shots: input.shots,
    visuals: input.visuals,
    places: input.places,
    assets: input.assets,
  })
  const shotsById = new Map(input.shots.map((shot) => [shot.id, shot]))
  const byCode: Record<ShotQcCode, number> = {
    "missing-anchor": 0,
    "locked-trait": 0,
    "missing-reference": 0,
    "invalid-duration": 0,
    "stale-reference": 0,
  }
  const issues: ContinuityIssue[] = []
  const repairQueue: ContinuityRepairItem[] = []

  for (const result of qc) {
    if (!result.needsRepair) continue
    const shot = shotsById.get(result.shotId)
    if (!shot) continue
    const actions = new Set<string>()
    const reasons: string[] = []
    const issueCodes: ShotQcCode[] = []

    for (const issue of result.issues) {
      byCode[issue.code] += 1
      const action = CONTINUITY_ACTIONS[issue.code]
      actions.add(action)
      reasons.push(issue.message)
      issueCodes.push(issue.code)
      issues.push({
        code: issue.code,
        severity: severityFor(issue.code),
        shotId: shot.id,
        entityId: shot.entityId,
        episode: shot.episode,
        shot: shot.shot,
        scene: shot.scene,
        status: shot.status,
        character: issue.character,
        message: issue.message,
        action,
      })
    }

    repairQueue.push({
      shotId: shot.id,
      entityId: shot.entityId,
      episode: shot.episode,
      shot: shot.shot,
      scene: shot.scene,
      status: shot.status,
      actions: [...actions],
      reasons,
      issueCodes: [...new Set(issueCodes)],
    })
  }

  issues.sort(sortByEpisodeAndShot)
  repairQueue.sort(sortByEpisodeAndShot)
  const issueShots = new Set(issues.map((issue) => issue.entityId)).size
  const episodesWithIssues = new Set(issues.map((issue) => issue.episode).filter(Boolean)).size

  return {
    projectId: input.projectId,
    readOnly: true,
    writes: false,
    modelCalls: 0,
    quotaCharged: 0,
    sourceSnapshotIds: {
      shots: input.sourceSnapshotIds?.shots ?? null,
      visualCharacters: input.sourceSnapshotIds?.visualCharacters ?? null,
      visualPlaces: input.sourceSnapshotIds?.visualPlaces ?? null,
    },
    summary: {
      totalShots: input.shots.length,
      issueShots,
      cleanShots: Math.max(0, input.shots.length - issueShots),
      issueCount: issues.length,
      episodesWithIssues,
      byCode,
    },
    issues,
    repairQueue,
  }
}

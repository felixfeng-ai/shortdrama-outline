import {
  injectAnchor,
  missingLockedTraits,
  placeGenerationTargetId,
  visualTraitLabel,
} from "./anchors.ts"
import {
  isSupportedDuration,
  type Shot,
  type VisualCharacter,
  type VisualPlace,
} from "./types.ts"
import type { GeneratedAsset } from "../generation/types.ts"

export type ShotQcCode =
  | "missing-anchor"
  | "locked-trait"
  | "missing-reference"
  | "invalid-duration"
  | "stale-reference"

export interface ShotQcIssue {
  code: ShotQcCode
  message: string
  character?: string
}

export interface ShotQcResult {
  shotId: string
  entityId: string
  episode: number
  shot: number
  needsRepair: boolean
  staleReferences: string[]
  issues: ShotQcIssue[]
}

function latestSelectedAssets(assets: GeneratedAsset[]): Map<string, GeneratedAsset> {
  const latest = new Map<string, GeneratedAsset>()
  for (const asset of assets) {
    if (asset.selectedAt === null) continue
    const key = `${asset.targetType}:${asset.targetId}`
    const current = latest.get(key)
    if (!current || asset.selectedAt > (current.selectedAt ?? 0)) latest.set(key, asset)
  }
  return latest
}

function referenceChangedAfterShot(
  shotAsset: GeneratedAsset,
  reference: GeneratedAsset,
): boolean {
  return reference.createdAt > shotAsset.createdAt ||
    reference.selectedAt! > (shotAsset.selectedAt ?? 0)
}

/**
 * 当前缺图必须以现在的已采用图片为准。
 *
 * 分镜快照里的 missingRefFor 只代表“生成分镜当时”的状态；用户后来补了定妆图后，
 * 不能继续拿旧字段拦截生成。这里派生一份只读 Shot[]，不改写历史快照。
 */
export function reconcileShotReferenceGaps(input: {
  shots: Shot[]
  visuals: VisualCharacter[]
  assets: GeneratedAsset[]
}): Shot[] {
  const visualsByName = new Map(input.visuals.map((visual) => [visual.name, visual]))
  const selected = latestSelectedAssets(input.assets)
  return input.shots.map((shot) => {
    const historicalMissing = new Set(shot.missingRefFor ?? [])
    const missingRefFor = [...new Set((shot.characters ?? []).filter((name) => {
      const visual = visualsByName.get(name)
      if (!visual) return historicalMissing.has(name)
      const targetId = visual.entityId ?? visual.id
      return !selected.has(`character:${targetId}`)
    }))]
    const unchanged = missingRefFor.length === (shot.missingRefFor ?? []).length
      && missingRefFor.every((name, index) => name === (shot.missingRefFor ?? [])[index])
    return unchanged ? shot : { ...shot, missingRefFor }
  })
}

export function auditShotProduction(input: {
  shots: Shot[]
  visuals: VisualCharacter[]
  places?: VisualPlace[]
  assets: GeneratedAsset[]
}): ShotQcResult[] {
  const visualsByName = new Map(input.visuals.map((visual) => [visual.name, visual]))
  const placesByName = new Map((input.places ?? []).map((place) => [place.name, place]))
  const selected = latestSelectedAssets(input.assets)
  const currentShots = reconcileShotReferenceGaps(input)

  return currentShots.map((shot) => {
    const issues: ShotQcIssue[] = []
    const staleReferences: string[] = []
    const shotAsset = selected.get(`shot:${shot.entityId}`)

    for (const name of shot.characters ?? []) {
      const visual = visualsByName.get(name)
      if (!visual) continue
      const anchor = visual.anchor?.trim() ?? ""
      if (anchor && !shot.prompt.includes(anchor)) {
        issues.push({
          code: "missing-anchor",
          character: name,
          message: `${name} 的当前角色锚点未进入 Prompt`,
        })
      }
      const traits = missingLockedTraits(shot.prompt, visual)
      if (traits.length > 0) {
        issues.push({
          code: "locked-trait",
          character: name,
          message: `${name} 缺少禁改项：${traits.map(visualTraitLabel).join("、")}`,
        })
      }
      const entityId = visual.entityId ?? visual.id
      const reference = selected.get(`character:${entityId}`)
      if (shotAsset && reference && referenceChangedAfterShot(shotAsset, reference)) {
        staleReferences.push(name)
      }
    }

    const place = shot.place ? placesByName.get(shot.place) : undefined
    if (place) {
      const anchor = place.anchor?.trim() ?? ""
      if (anchor && !shot.prompt.includes(anchor)) {
        issues.push({
          code: "missing-anchor",
          character: place.name,
          message: `${place.name} 的当前地点锚点未进入 Prompt`,
        })
      }
      const placeAsset = selected.get(`place:${placeGenerationTargetId(place.name)}`)
      if (shotAsset && placeAsset && referenceChangedAfterShot(shotAsset, placeAsset)) {
        staleReferences.push(place.name)
      }
    }

    if ((shot.missingRefFor ?? []).length > 0) {
      issues.push({
        code: "missing-reference",
        message: `缺 ${shot.missingRefFor.join("、")} 的参考图`,
      })
    }
    if (!isSupportedDuration(shot.params.duration)) {
      issues.push({
        code: "invalid-duration",
        message: `时长 ${shot.params.duration} 秒不是 5/10 秒档位`,
      })
    }
    for (const name of staleReferences) {
      issues.push({
        code: "stale-reference",
        character: name,
        message: `${name} 的采用图晚于本镜采用图，参考可能已过期`,
      })
    }

    return {
      shotId: shot.id,
      entityId: shot.entityId,
      episode: shot.episode,
      shot: shot.shot,
      needsRepair: issues.length > 0,
      staleReferences: Array.from(new Set(staleReferences)),
      issues,
    }
  })
}

/**
 * 只做确定性文本修复：把当前锚点追加到 Prompt，不调用模型。
 * 已有采用图的镜头改了 Prompt 就必须重新成像，否则导出看起来更新了、图仍是旧的。
 */
export function repairShotAnchors(
  shot: Shot,
  visuals: VisualCharacter[],
  places: VisualPlace[] = [],
): Shot {
  const visualsByName = new Map(visuals.map((visual) => [visual.name, visual]))
  const placesByName = new Map(places.map((place) => [place.name, place]))
  let prompt = shot.prompt
  for (const name of shot.characters ?? []) {
    const visual = visualsByName.get(name)
    if (visual?.anchor?.trim()) prompt = injectAnchor(prompt, visual.anchor)
  }
  const place = shot.place ? placesByName.get(shot.place) : undefined
  if (place?.anchor?.trim()) prompt = injectAnchor(prompt, place.anchor)
  if (prompt === shot.prompt) return shot
  return {
    ...shot,
    prompt,
    status: shot.status === "done" ? "rework" : shot.status,
  }
}

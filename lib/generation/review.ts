import type { Shot, VisualCharacter } from "../assets/types.ts"
import type { GeneratedAsset } from "./types.ts"

export interface ReviewGroup {
  key: string
  targetType: GeneratedAsset["targetType"]
  targetId: string
  title: string
  subtitle: string
  assets: GeneratedAsset[]
}

export function buildReviewGroups(
  assets: GeneratedAsset[],
  visuals: VisualCharacter[],
  shots: Shot[],
): ReviewGroup[] {
  const visualByTarget = new Map<string, VisualCharacter>()
  for (const visual of visuals) {
    visualByTarget.set(visual.entityId ?? visual.id, visual)
    visualByTarget.set(visual.id, visual)
  }

  const shotByTarget = new Map<string, Shot>()
  for (const shot of shots) {
    shotByTarget.set(shot.entityId, shot)
    shotByTarget.set(shot.id, shot)
  }

  const grouped = new Map<string, ReviewGroup>()
  for (const asset of assets) {
    const key = `${asset.targetType}:${asset.targetId}`
    let group = grouped.get(key)
    if (!group) {
      if (asset.targetType === "character") {
        const visual = visualByTarget.get(asset.targetId)
        group = {
          key,
          targetType: asset.targetType,
          targetId: asset.targetId,
          title: visual?.name || `角色 ${asset.targetId.slice(0, 6)}`,
          subtitle: "角色定妆",
          assets: [],
        }
      } else {
        const shot = shotByTarget.get(asset.targetId)
        group = {
          key,
          targetType: asset.targetType,
          targetId: asset.targetId,
          title: shot ? `第 ${shot.shot} 镜` : `镜头 ${asset.targetId.slice(0, 6)}`,
          subtitle: shot?.scene || "镜头首帧",
          assets: [],
        }
      }
      grouped.set(key, group)
    }
    group.assets.push(asset)
  }

  const groups = [...grouped.values()]
  for (const group of groups) {
    group.assets.sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id))
  }
  groups.sort((a, b) => {
    const newestA = a.assets[0]?.createdAt ?? 0
    const newestB = b.assets[0]?.createdAt ?? 0
    return newestB - newestA || a.key.localeCompare(b.key)
  })
  return groups
}

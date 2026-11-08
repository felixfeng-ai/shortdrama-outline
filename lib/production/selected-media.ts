import type { Shot } from "../assets/types.ts"
import type { GeneratedAsset } from "../generation/types.ts"

export interface SelectedShotMedia {
  image?: GeneratedAsset
  video?: GeneratedAsset
}

export function selectedShotMedia(
  shots: Shot[],
  assets: GeneratedAsset[],
): Map<string, SelectedShotMedia> {
  const canonicalShotId = new Map<string, string>()
  for (const shot of shots) {
    canonicalShotId.set(shot.id, shot.id)
    if (shot.entityId) canonicalShotId.set(shot.entityId, shot.id)
  }
  const media = new Map<string, SelectedShotMedia>()
  const ordered = [...assets].sort(
    (left, right) => (right.selectedAt ?? 0) - (left.selectedAt ?? 0),
  )

  for (const asset of ordered) {
    if (asset.selectedAt === null) continue
    if (asset.targetType !== "shot") continue
    const shotId = canonicalShotId.get(asset.targetId)
    if (!shotId) continue
    if (asset.mediaKind !== "image" && asset.mediaKind !== "video") continue
    const current = media.get(shotId) ?? {}
    if (asset.mediaKind === "image" && !current.image) current.image = asset
    if (asset.mediaKind === "video" && !current.video) current.video = asset
    media.set(shotId, current)
  }

  return media
}

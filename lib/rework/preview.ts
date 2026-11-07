import { repairShotAnchors } from "../assets/qc.ts"
import type { Shot, VisualCharacter, VisualPlace } from "../assets/types.ts"
import type { GeneratedAsset } from "../generation/types.ts"

export interface RepairAnchorsPreview {
  kind: "repair-anchors"
  shotIds: string[]
  shotCount: number
  episodeCount: number
  sceneCount: number
  selectedImageShots: number
  estimatedCostMicros: number
}

/**
 * 修改前影响预览只预测确定性 Prompt 修复。
 * 这里不写库、不调用模型；费用为 0 是契约而不是展示占位。
 */
export function buildRepairAnchorsPreview(input: {
  shots: Shot[]
  visuals: VisualCharacter[]
  places: VisualPlace[]
  assets: GeneratedAsset[]
}): RepairAnchorsPreview {
  const affected = input.shots.filter((shot) => {
    const next = repairShotAnchors(shot, input.visuals, input.places)
    return next.prompt !== shot.prompt
  })
  const shotIds = affected.map((shot) => shot.entityId)
  const selected = new Set(
    input.assets
      .filter((asset) =>
        asset.targetType === "shot"
        && asset.selectedAt !== null
        && shotIds.includes(asset.targetId)
      )
      .map((asset) => asset.targetId),
  )
  return {
    kind: "repair-anchors",
    shotIds,
    shotCount: affected.length,
    episodeCount: new Set(affected.map((shot) => shot.episode)).size,
    sceneCount: new Set(affected.map((shot) => `${shot.episode}:${shot.scene}`)).size,
    selectedImageShots: selected.size,
    estimatedCostMicros: 0,
  }
}

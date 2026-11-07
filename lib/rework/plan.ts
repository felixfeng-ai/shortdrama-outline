import { repairShotAnchors } from "../assets/qc.ts"
import type { Shot, VisualCharacter, VisualPlace } from "../assets/types.ts"

export type BatchReworkAction = "repair-anchors"

export interface BatchReworkInput {
  action: BatchReworkAction
  shots: Shot[]
  visuals: VisualCharacter[]
  places: VisualPlace[]
  shotIds?: string[]
}

export interface BatchReworkResult {
  shots: Shot[]
  changedIds: string[]
}

/**
 * 批量返修只处理确定性文本修复。
 * 接口层据此生成新快照；模型重生成、图片采用和视频付费动作不能走这里。
 */
export function applyShotRework(input: BatchReworkInput): BatchReworkResult {
  const selected = input.shotIds && input.shotIds.length > 0
    ? new Set(input.shotIds)
    : null
  const changedIds: string[] = []
  const shots = input.shots.map((shot) => {
    if (selected && !selected.has(shot.entityId) && !selected.has(shot.id)) return shot
    const repaired = repairShotAnchors(shot, input.visuals, input.places)
    if (repaired.prompt !== shot.prompt) changedIds.push(shot.entityId)
    return repaired
  })
  return { shots, changedIds }
}

import type { Shot } from "../assets/types.ts"
import type { GeneratedAsset } from "../generation/types.ts"
import { QUICK_TRIAL_STORYBOARD_SHOT_COUNT } from "./quick-trial.ts"
import { selectedShotMedia } from "./selected-media.ts"

export function selectStoryboardShots(
  shots: Shot[],
  count = QUICK_TRIAL_STORYBOARD_SHOT_COUNT,
): Shot[] {
  return [...shots]
    .sort((left, right) => left.episode - right.episode || left.shot - right.shot)
    .slice(0, Math.max(0, count))
}

export function missingStoryboardKeyframes(
  shots: Shot[],
  assets: GeneratedAsset[],
  count = QUICK_TRIAL_STORYBOARD_SHOT_COUNT,
): Shot[] {
  const selected = selectedShotMedia(shots, assets)
  return selectStoryboardShots(shots, count).filter((shot) => {
    const media = selected.get(shot.id)
    return !media?.image && !media?.video
  })
}

// 项目状态口径：画布、项目待办、AI 场记共用同一套判定。
//
// 这些规则以前散在三个地方：页面里的 canvasIssues、todo.ts、agent/tools.ts。
// 同一份项目在三处得出不同数字时，用户不知道该信谁；因此这里只保留一份。
import type { StepKey } from "./types.ts"
import type { Shot, VisualCharacter, VisualPlace, Scene } from "./assets/types.ts"
import type { Act, Character, Episode } from "./types.ts"

export interface ShotStatusInput {
  shot: number
  missingRefFor: string[]
  status: string
}

export interface ShotReview {
  total: number
  missing: ShotStatusInput[]
  missingNames: string[]
  rework: ShotStatusInput[]
  expired: number
  /** 节点用的保守总数：同一镜头可能同时缺图和返修，不重复计数 */
  problemCount: number
}

export interface EpisodeStatusInput {
  number: number
  hook: string
}

export interface EpisodeReview {
  empty: EpisodeStatusInput[]
  short: EpisodeStatusInput[]
  problemCount: number
}

export interface ProjectStatusInput {
  characters: Character[]
  acts: Act[]
  episodes: Episode[]
  visuals: VisualCharacter[]
  scenes: Scene[]
  places: VisualPlace[]
  shots: Shot[]
  expiredShots: number
  visualsStale: boolean
}

export interface ProjectStatus {
  counts: {
    characters: number
    acts: number
    episodes: number
    visuals: number
    scenes: number
    shots: number
    places: number
  }
  issues: Partial<Record<StepKey, number>>
  placeGaps: number
  shots: ShotReview
  episodes: EpisodeReview
}

export function reviewShots(shots: readonly ShotStatusInput[], expiredShots = 0): ShotReview {
  const missing = shots.filter((shot) => shot.missingRefFor.length > 0)
  const rework = shots.filter((shot) => shot.status === "rework")
  const flagged = shots.filter((shot) => shot.missingRefFor.length > 0 || shot.status === "rework")
  return {
    total: shots.length,
    missing,
    missingNames: [...new Set(missing.flatMap((shot) => shot.missingRefFor))],
    rework,
    expired: Math.max(0, expiredShots),
    problemCount: Math.max(flagged.length, expiredShots),
  }
}

export function reviewEpisodes(episodes: readonly EpisodeStatusInput[]): EpisodeReview {
  const empty = episodes.filter((episode) => !episode.hook.trim())
  const short = episodes.filter((episode) => episode.hook.trim() && episode.hook.trim().length < 20)
  return { empty, short, problemCount: empty.length + short.length }
}

export function buildProjectStatus(input: ProjectStatusInput): ProjectStatus {
  const shots = reviewShots(input.shots, input.expiredShots)
  const episodes = reviewEpisodes(input.episodes)
  const missingPlaces = [...new Set(input.scenes.map((scene) => scene.location).filter(Boolean))]
    .filter((location) => !input.places.some((place) => place.name === location && place.anchor.trim()))

  const characterGaps = input.characters.filter((character) =>
    !character.motivation.trim() || !character.arc.trim(),
  ).length
  const visualGaps = input.characters.filter((character) =>
    input.visualsStale ||
    !input.visuals.some((visual) => visual.name === character.name && visual.anchor.trim()),
  ).length

  return {
    counts: {
      characters: input.characters.length,
      acts: input.acts.length,
      episodes: input.episodes.length,
      visuals: input.visuals.length,
      scenes: input.scenes.length,
      shots: input.shots.length,
      places: input.places.length,
    },
    issues: {
      characters: characterGaps,
      acts: input.acts.length > 0 && input.acts.length < 3 ? 3 - input.acts.length : 0,
      episodes: episodes.problemCount,
      visuals: visualGaps,
      scenes: input.scenes.filter((scene) => !scene.location.trim() || !scene.summary.trim()).length,
      shots: shots.problemCount,
    },
    placeGaps: missingPlaces.length,
    shots,
    episodes,
  }
}

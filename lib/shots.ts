export const SHOT_BATCH_SIZE = 8

export interface ShotBatch {
  index: number
  sceneStart: number
  sceneEnd: number
}

export function planShotBatches(sceneCount: number, batchSize = SHOT_BATCH_SIZE): ShotBatch[] {
  const count = Math.max(0, Math.floor(Number(sceneCount) || 0))
  const size = Math.max(1, Math.floor(batchSize))
  const batches: ShotBatch[] = []
  for (let sceneStart = 1; sceneStart <= count; sceneStart += size) {
    batches.push({
      index: batches.length + 1,
      sceneStart,
      sceneEnd: Math.min(count, sceneStart + size - 1),
    })
  }
  return batches
}

export function shotTokenBudget(sceneCount: number): number {
  const count = Math.min(SHOT_BATCH_SIZE, Math.max(1, Math.floor(Number(sceneCount) || 1)))
  return Math.min(12_000, 5_000 + count * 250)
}

export function shotBatchLabel(batch: ShotBatch, total: number): string {
  const totalBatches = Math.max(1, planShotBatches(total).length)
  return `第 ${batch.index}/${totalBatches} 批 · 第 ${batch.sceneStart}-${batch.sceneEnd} 场`
}

export interface ShotSceneGroup<T> {
  label: string
  shots: T[]
}

export interface ShotEpisodeGroup<T> {
  episode: number
  shots: T[]
  scenes: ShotSceneGroup<T>[]
  shotCount: number
  durationSeconds: number
  missingRefShots: number
  reworkShots: number
}

type GroupableShot = {
  episode: number
  scene?: string
  params?: { duration?: number }
  missingRefFor?: unknown[]
  status?: string
}

export function groupShotsByEpisode<T extends GroupableShot>(shots: T[]): ShotEpisodeGroup<T>[] {
  const byEpisode = new Map<number, T[]>()
  for (const shot of shots) {
    const raw = Math.floor(Number(shot.episode))
    const episode = Number.isFinite(raw) && raw > 0 ? raw : 0
    const group = byEpisode.get(episode) ?? []
    group.push(shot)
    byEpisode.set(episode, group)
  }

  return [...byEpisode.entries()]
    .sort(([left], [right]) => left - right)
    .map(([episode, episodeShots]) => {
      const scenes: ShotSceneGroup<T>[] = []
      for (const shot of episodeShots) {
        const label = shot.scene?.trim() || "场景未标注"
        const current = scenes[scenes.length - 1]
        if (current?.label === label) current.shots.push(shot)
        else scenes.push({ label, shots: [shot] })
      }

      return {
        episode,
        shots: episodeShots,
        scenes,
        shotCount: episodeShots.length,
        durationSeconds: episodeShots.reduce((sum, shot) => {
          const duration = Number(shot.params?.duration)
          return sum + (Number.isFinite(duration) && duration > 0 ? duration : 0)
        }, 0),
        missingRefShots: episodeShots.filter((shot) => (shot.missingRefFor?.length ?? 0) > 0).length,
        reworkShots: episodeShots.filter((shot) => shot.status === "rework").length,
      }
    })
}

export interface ProductionMapItem {
  id: string
  title: string
  episode?: number
  scene?: string
  meta?: string
  note?: string
  missing?: boolean
}

export interface ProductionMapShot extends ProductionMapItem {
  targetId?: string
  shotNumber?: number
  status?: string
  duration?: number
}

export interface ProductionMapScene {
  id: string
  title: string
  meta?: string
  note?: string
  missing?: boolean
  shots: ProductionMapShot[]
  missingCount: number
  duration: number
}

export interface ProductionMapEpisode {
  number: number
  label: string
  title: string
  meta?: string
  note?: string
  scenes: ProductionMapScene[]
  shotCount: number
  missingCount: number
  duration: number
}

export interface ProductionMap {
  episodes: ProductionMapEpisode[]
  totals: {
    episodes: number
    scenes: number
    shots: number
    missing: number
    duration: number
  }
}

interface SceneBucket {
  id: string
  title: string
  meta?: string
  note?: string
  missing: boolean
  shots: ProductionMapShot[]
}

interface EpisodeBucket {
  number: number
  title: string
  meta?: string
  note?: string
  missing: boolean
  scenes: Map<string, SceneBucket>
}

function episodeNumber(value: number | undefined): number {
  return Number.isInteger(value) && value! > 0 ? value! : 0
}

function episodeLabel(number: number): string {
  return number > 0 ? `第 ${number} 集` : '未标集'
}

function sceneKey(scene: string | undefined): string {
  return scene?.trim() || '__unspecified__'
}

function sceneLabel(scene: string | undefined): string {
  return scene?.trim() || '未标场次'
}

function ensureEpisode(
  buckets: Map<number, EpisodeBucket>,
  number: number,
  item?: ProductionMapItem,
): EpisodeBucket {
  const existing = buckets.get(number)
  if (existing) {
    if (item && !item.missing) existing.missing = false
    if (item?.meta && !existing.meta) existing.meta = item.meta
    if (item?.note && !existing.note) existing.note = item.note
    return existing
  }
  const bucket: EpisodeBucket = {
    number,
    title: item?.title || episodeLabel(number),
    meta: item?.meta,
    note: item?.note,
    missing: Boolean(item?.missing),
    scenes: new Map(),
  }
  buckets.set(number, bucket)
  return bucket
}

function ensureScene(
  episode: EpisodeBucket,
  key: string,
  title: string,
  item?: ProductionMapItem,
): SceneBucket {
  const existing = episode.scenes.get(key)
  if (existing) return existing
  const scene: SceneBucket = {
    id: item?.id || `scene:${episode.number}:${key}`,
    title,
    meta: item?.meta,
    note: item?.note,
    missing: Boolean(item?.missing),
    shots: [],
  }
  episode.scenes.set(key, scene)
  return scene
}

/**
 * 把画布已有的集、场、镜条目收成可浏览的生产地图。
 *
 * 这里不查询数据库，也不猜缺失关系：输入已经来自页面当前的预览数据，
 * 函数只负责稳定分组和汇总，因此大项目也能在本地一次渲染完成。
 */
export function buildProductionMap(input: {
  episodes: readonly ProductionMapItem[]
  scenes: readonly ProductionMapItem[]
  shots: readonly ProductionMapShot[]
}): ProductionMap {
  const buckets = new Map<number, EpisodeBucket>()

  for (const episode of input.episodes) {
    ensureEpisode(buckets, episodeNumber(episode.episode), episode)
  }

  for (const scene of input.scenes) {
    const number = episodeNumber(scene.episode)
    const episode = ensureEpisode(buckets, number)
    ensureScene(
      episode,
      sceneKey(scene.scene),
      scene.title || sceneLabel(scene.scene),
      scene,
    )
  }

  for (const shot of input.shots) {
    const number = episodeNumber(shot.episode)
    const episode = ensureEpisode(buckets, number)
    const key = sceneKey(shot.scene)
    const scene = ensureScene(
      episode,
      key,
      shot.scene?.trim() || '未标场次',
    )
    scene.shots.push(shot)
  }

  const episodes: ProductionMapEpisode[] = [...buckets.values()]
    .sort((left, right) => left.number - right.number)
    .map((episode) => {
      const scenes: ProductionMapScene[] = [...episode.scenes.values()].map((scene) => {
        const missingCount = scene.shots.filter((shot) => shot.missing).length
          + (scene.missing ? 1 : 0)
        const duration = scene.shots.reduce((sum, shot) => sum + (shot.duration ?? 0), 0)
        return {
          id: scene.id,
          title: scene.title,
          meta: scene.meta,
          note: scene.note,
          missing: scene.missing,
          shots: scene.shots,
          missingCount,
          duration,
        }
      })
      const shotCount = scenes.reduce((sum, scene) => sum + scene.shots.length, 0)
      const missingCount = scenes.reduce((sum, scene) => sum + scene.missingCount, 0)
        + (episode.missing ? 1 : 0)
      const duration = scenes.reduce((sum, scene) => sum + scene.duration, 0)
      return {
        number: episode.number,
        label: episodeLabel(episode.number),
        title: episode.title,
        meta: episode.meta,
        note: episode.note,
        scenes,
        shotCount,
        missingCount,
        duration,
      }
    })

  return {
    episodes,
    totals: {
      episodes: episodes.length,
      scenes: episodes.reduce((sum, episode) => sum + episode.scenes.length, 0),
      shots: episodes.reduce((sum, episode) => sum + episode.shotCount, 0),
      missing: episodes.reduce((sum, episode) => sum + episode.missingCount, 0),
      duration: episodes.reduce((sum, episode) => sum + episode.duration, 0),
    },
  }
}

import type {
  NovelPlan,
  NovelPlannedChapter,
  NovelPreset,
} from "./types.ts"

interface PlannerEpisode {
  number: number
  title: string
  synopsis: string
  hook: string
}

interface PlannerScene {
  id: string
  episode: number
  summary: string
  location: string
}

interface PlannerSource {
  title: string
  episodes: PlannerEpisode[]
  scenes: PlannerScene[]
}

const VOLUME_COUNT = 6
const VOLUME_TITLES = [
  "第一卷 未寄出的信",
  "第二卷 被删去的名字",
  "第三卷 雨幕之后",
  "第四卷 沉默的证人",
  "第五卷 旧案回声",
  "第六卷 真相的代价",
]

function splitEvenly(total: number, parts: number): Array<{ start: number; end: number }> {
  const count = Math.max(1, Math.min(parts, total))
  const base = Math.floor(total / count)
  const remainder = total % count
  let cursor = 1
  return Array.from({ length: count }, (_, index) => {
    const size = base + (index < remainder ? 1 : 0)
    const range = { start: cursor, end: cursor + size - 1 }
    cursor += size
    return range
  })
}

/** 把章号稳定映射到来源集，保证一集可以扩写多章，但不会跳到未来剧情。 */
function episodeForChapter(index: number, chapters: number, episodes: number): number {
  if (episodes <= 0) return Math.max(1, index + 1)
  return Math.min(episodes, Math.floor((index * episodes) / chapters) + 1)
}

export function planNovel(source: PlannerSource, preset: NovelPreset): NovelPlan {
  const chaptersTotal = preset.targetChapters
  const episodes = [...source.episodes].sort((left, right) => left.number - right.number)
  const scenes = [...source.scenes].sort((left, right) => left.episode - right.episode)
  const volumes = splitEvenly(chaptersTotal, VOLUME_COUNT).map((range, index) => ({
    title: VOLUME_TITLES[index] ?? `第 ${index + 1} 卷`,
    summary: `${source.title} · 第 ${range.start}-${range.end} 章`,
    startChapter: range.start,
    endChapter: range.end,
  }))

  const chapters: NovelPlannedChapter[] = Array.from({ length: chaptersTotal }, (_, index) => {
    const number = index + 1
    const sourceEpisode = episodeForChapter(index, chaptersTotal, episodes.length)
    const episode = episodes.find((item) => item.number === sourceEpisode) ?? episodes[0]
    const episodeScenes = scenes.filter((scene) => scene.episode === sourceEpisode)
    const scene = episodeScenes[index % Math.max(1, episodeScenes.length)]
    const arcPosition = (index % 8) + 1
    const titleBase = episode?.title?.trim() || `第 ${sourceEpisode} 集`
    const title = number === 1
      ? titleBase
      : `${titleBase} · ${["来信", "缺口", "回声", "证词", "暗线", "代价", "旧影", "余波"][arcPosition - 1]}`
    const sceneText = scene?.summary?.trim()
      || episode?.synopsis?.trim()
      || `围绕第 ${sourceEpisode} 集主线推进新的冲突与选择。`
    return {
      number,
      title,
      outline: `${scene?.location ? `${scene.location}。` : ""}${sceneText} 本章围绕来源集第 ${sourceEpisode} 集展开，推进人物关系并留下新的因果缺口。`,
      hook: episode?.hook?.trim() || `第 ${number} 章结尾，一个新的证据改变了人物的判断。`,
      targetWords: Math.max(preset.chapterWordsMin, Math.round(preset.wordsMin / preset.targetChapters / 100) * 100),
      sourceEpisode,
      sourceSceneIds: scene ? [scene.id] : [],
    }
  })

  return { volumes, chapters }
}

export interface PacingBenchmark {
  label: string
  hookMinChars: number
  hookMaxChars: number
  dialogueCharsPerShotMax: number
  averageShotSecondsMax: number
  minimumShotsPerEpisode: number
}

export const DEFAULT_MOBILE_PACING_BENCHMARK: PacingBenchmark = {
  label: 'VeyaTV 竖屏短剧基准',
  hookMinChars: 20,
  hookMaxChars: 80,
  dialogueCharsPerShotMax: 35,
  averageShotSecondsMax: 12,
  minimumShotsPerEpisode: 3,
}

export type HookStatus = 'good' | 'short' | 'long' | 'missing'
export type EndingSuspense = 'open' | 'resolved' | 'short' | 'missing'

export interface EpisodePacingRow {
  episode: number
  title: string
  hookChars: number
  hookStatus: HookStatus
  endingSuspense: EndingSuspense
  shotCount: number
  dialogueChars: number
  dialogueCharsPerShot: number
  averageShotSeconds: number
  observations: string[]
}

export interface MobilePacingReport {
  benchmark: PacingBenchmark
  summary: string
  rows: EpisodePacingRow[]
  warnings: string[]
}

type EpisodeLike = {
  number: number
  title: string
  hook: string
}

type ShotLike = {
  episode: number
  dialogue?: string
  params?: { duration?: number }
}

const RESOLVED_HOOK = /(最终|终于|从此|就这样|明白了|决定|成功|解决|和解|原谅|真相大白)/

function compact(value: string): string {
  return value.replace(/\s+/g, '')
}

function hookStatus(length: number, benchmark: PacingBenchmark): HookStatus {
  if (length === 0) return 'missing'
  if (length < benchmark.hookMinChars) return 'short'
  if (length > benchmark.hookMaxChars) return 'long'
  return 'good'
}

function endingSuspense(hook: string): EndingSuspense {
  const value = hook.trim()
  if (!value) return 'missing'
  if (compact(value).length < 8) return 'short'
  if (RESOLVED_HOOK.test(value) && /[。！!]$/.test(value)) return 'resolved'
  return 'open'
}

export function analyzeEpisodePacing(input: {
  episodes: readonly EpisodeLike[]
  shots: readonly ShotLike[]
  benchmark?: Partial<PacingBenchmark>
}): MobilePacingReport {
  const benchmark = { ...DEFAULT_MOBILE_PACING_BENCHMARK, ...input.benchmark }
  const ordered = [...input.episodes].sort((left, right) => left.number - right.number)
  const rows = ordered.map((episode): EpisodePacingRow => {
    const episodeShots = input.shots.filter((shot) => Number(shot.episode) === episode.number)
    const shotCount = episodeShots.length
    const dialogueChars = episodeShots.reduce(
      (total, shot) => total + compact(shot.dialogue ?? '').length,
      0,
    )
    const dialogueCharsPerShot = shotCount > 0 ? Math.round(dialogueChars / shotCount) : 0
    const averageShotSeconds = shotCount > 0
      ? Math.round(
          episodeShots.reduce((total, shot) =>
            total + Math.max(0, Number(shot.params?.duration) || 0), 0,
          ) / shotCount,
        )
      : 0
    const hookLength = compact(episode.hook).length
    const status = hookStatus(hookLength, benchmark)
    const suspense = endingSuspense(episode.hook)
    const observations: string[] = []
    if (status === 'missing') observations.push('结尾钩子为空')
    if (status === 'short') observations.push('结尾钩子偏短')
    if (status === 'long') observations.push('结尾钩子偏长')
    if (suspense === 'resolved') observations.push('结尾更像已经解决的总结')
    if (shotCount < benchmark.minimumShotsPerEpisode) observations.push('镜头不足')
    if (dialogueCharsPerShot > benchmark.dialogueCharsPerShotMax) {
      observations.push('对白密度偏高')
    }
    if (averageShotSeconds > benchmark.averageShotSecondsMax) observations.push('平均镜头偏长')
    return {
      episode: episode.number,
      title: episode.title,
      hookChars: hookLength,
      hookStatus: status,
      endingSuspense: suspense,
      shotCount,
      dialogueChars,
      dialogueCharsPerShot,
      averageShotSeconds,
      observations,
    }
  })
  const warnings = rows
    .flatMap((row) => row.observations.map((item) => `第 ${row.episode} 集：${item}`))
    .slice(0, 40)
  return {
    benchmark,
    summary: rows.length === 0
      ? '还没有分集，暂时没有节奏可分析。'
      : `已检查 ${rows.length} 集，发现 ${warnings.length} 个节奏提醒。`,
    rows,
    warnings,
  }
}

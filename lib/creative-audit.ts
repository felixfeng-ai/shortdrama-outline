import type { CreativeBrief } from "./brief.ts"
import { isFlatPacing, pacingSeries } from "./pacing.ts"

export type CreativeAuditCode =
  | "empty-hook"
  | "short-hook"
  | "summary-hook"
  | "repeated-hook-opening"
  | "template-phrases"
  | "weak-motivation"
  | "duplicate-motivation"
  | "missing-arc"
  | "redline-hit"
  | "flat-pacing"

export type CreativeAuditSeverity = "error" | "warning" | "info"

export interface CreativeAuditIssue {
  code: CreativeAuditCode
  severity: CreativeAuditSeverity
  area: "characters" | "episodes" | "contract" | "pacing"
  title: string
  evidence: string
  suggestion: string
  episode?: number
  character?: string
}

export interface CreativeAuditResult {
  issues: CreativeAuditIssue[]
  counts: {
    error: number
    warning: number
    info: number
    total: number
  }
}

export interface CreativeAuditInput {
  brief?: Partial<CreativeBrief>
  characters: readonly {
    name: string
    motivation: string
    arc: string
  }[]
  episodes: readonly {
    number: number
    title: string
    synopsis?: string
    hook: string
    intensity?: number
  }[]
}

const TEMPLATE_PHRASES = [
  "不禁",
  "仿佛",
  "命运",
  "五味杂陈",
  "终于明白",
  "意味深长",
  "若有所思",
  "心中一震",
  "微微一笑",
  "空气中弥漫",
]

const SUMMARY_HOOK = /(最终|终于|从此|就这样|明白了|决定|成功|解决|和解|原谅|真相大白)/

function compact(value: string): string {
  return value.replace(/[，。！？、；：,.!?;:\s]/g, "")
}

function pushIssue(issues: CreativeAuditIssue[], issue: CreativeAuditIssue): void {
  issues.push(issue)
}

function redlineTerms(value: string | undefined): string[] {
  if (!value) return []
  return [...new Set(
    value
      .split(/[，,。；;\n]/)
      .map((item) => item.trim().replace(/^(不要|不能|避免|禁止|不可)/, "").trim())
      .filter((item) => item.length >= 2),
  )]
}

function sorted(result: CreativeAuditIssue[]): CreativeAuditIssue[] {
  const order: Record<CreativeAuditSeverity, number> = { error: 0, warning: 1, info: 2 }
  return result
    .slice()
    .sort((left, right) =>
      order[left.severity] - order[right.severity]
      || (left.episode ?? 0) - (right.episode ?? 0)
      || (left.character ?? "").localeCompare(right.character ?? "")
    )
}

export function auditCreativeQuality(input: CreativeAuditInput): CreativeAuditResult {
  const issues: CreativeAuditIssue[] = []
  const episodes = [...input.episodes].sort((left, right) => left.number - right.number)

  for (const episode of episodes) {
    const hook = episode.hook.trim()
    if (!hook) {
      pushIssue(issues, {
        code: "empty-hook",
        severity: "error",
        area: "episodes",
        episode: episode.number,
        title: `第 ${episode.number} 集没有结尾钩子`,
        evidence: `${episode.title}：钩子为空`,
        suggestion: "补一个最后几秒发生的具体危机、揭示或未完成决定。",
      })
      continue
    }
    if (hook.length < 20) {
      pushIssue(issues, {
        code: "short-hook",
        severity: "warning",
        area: "episodes",
        episode: episode.number,
        title: `第 ${episode.number} 集钩子过短`,
        evidence: hook,
        suggestion: "写到 40–60 字，交代最后一秒发生了什么。",
      })
    }
    if (SUMMARY_HOOK.test(hook) && /[。！!]$/.test(hook)) {
      pushIssue(issues, {
        code: "summary-hook",
        severity: "warning",
        area: "episodes",
        episode: episode.number,
        title: `第 ${episode.number} 集结尾更像总结句`,
        evidence: hook,
        suggestion: "把已解决的结论改成新问题、新代价或被打断的决定。",
      })
    }

    const text = `${episode.synopsis ?? ""} ${hook}`
    const hits = TEMPLATE_PHRASES.filter((phrase) => text.includes(phrase))
    if (hits.length >= 2) {
      pushIssue(issues, {
        code: "template-phrases",
        severity: "warning",
        area: "episodes",
        episode: episode.number,
        title: `第 ${episode.number} 集出现集中模板化表达`,
        evidence: hits.join("、"),
        suggestion: "删掉抽象情绪词，改成具体动作、物件或可观察反应。",
      })
    }
  }

  const openings = new Map<string, typeof episodes>()
  for (const episode of episodes) {
    const prefix = compact(episode.hook).slice(0, 6)
    if (prefix.length < 4) continue
    const list = openings.get(prefix) ?? []
    list.push(episode)
    openings.set(prefix, list)
  }
  for (const [prefix, list] of openings) {
    if (list.length < 3) continue
    pushIssue(issues, {
      code: "repeated-hook-opening",
      severity: "warning",
      area: "episodes",
      episode: list[0].number,
      title: "多集钩子重复使用同一开头",
      evidence: `${prefix}…：第 ${list.map((item) => item.number).join("、")} 集`,
      suggestion: "按每集最后发生的事件重写开头，不要复用同一句式。",
    })
    break
  }

  const motivations = new Map<string, string[]>()
  for (const character of input.characters) {
    const motivation = compact(character.motivation)
    if (motivation.length < 6) {
      pushIssue(issues, {
        code: "weak-motivation",
        severity: "error",
        area: "characters",
        character: character.name,
        title: `${character.name} 的动机过短或为空`,
        evidence: character.motivation || "（空）",
        suggestion: "补成“想要什么 + 为什么现在必须得到 + 失败会失去什么”。",
      })
    }
    if (motivation.length >= 2) {
      const names = motivations.get(motivation) ?? []
      names.push(character.name)
      motivations.set(motivation, names)
    }
    if (character.arc.trim().length < 8) {
      pushIssue(issues, {
        code: "missing-arc",
        severity: "warning",
        area: "characters",
        character: character.name,
        title: `${character.name} 的人物弧光不完整`,
        evidence: character.arc || "（空）",
        suggestion: "写成“从什么状态，因为哪件事，变成什么状态”。",
      })
    }
  }
  for (const names of motivations.values()) {
    if (names.length < 2) continue
    for (const name of names.slice(1)) {
      pushIssue(issues, {
        code: "duplicate-motivation",
        severity: "warning",
        area: "characters",
        character: name,
        title: `${name} 与另一名角色的动机完全相同`,
        evidence: names.join("、"),
        suggestion: "保留共同目标，但给每个人不同的欲望强度、手段和代价。",
      })
    }
  }

  const terms = redlineTerms(input.brief?.redline)
  if (terms.length > 0) {
    for (const episode of episodes) {
      const text = `${episode.synopsis ?? ""} ${episode.hook}`
      const hit = terms.find((term) => text.includes(term))
      if (!hit) continue
      pushIssue(issues, {
        code: "redline-hit",
        severity: "warning",
        area: "contract",
        episode: episode.number,
        title: `第 ${episode.number} 集直接命中创作契约红线`,
        evidence: hit,
        suggestion: "删改命中表达，或先修改契约并记录这次取舍。",
      })
    }
  }

  const hasUserPacing = episodes.some((episode) => episode.intensity !== undefined)
  const series = pacingSeries(episodes)
  if (hasUserPacing && isFlatPacing(series)) {
    pushIssue(issues, {
      code: "flat-pacing",
      severity: "warning",
      area: "pacing",
      title: "整体节奏长期走平",
      evidence: series.join(" / "),
      suggestion: "在铺垫、升级、低谷和连续高潮之间拉开至少两档强度差。",
    })
  }

  const ordered = sorted(issues)
  return {
    issues: ordered,
    counts: {
      error: ordered.filter((item) => item.severity === "error").length,
      warning: ordered.filter((item) => item.severity === "warning").length,
      info: ordered.filter((item) => item.severity === "info").length,
      total: ordered.length,
    },
  }
}

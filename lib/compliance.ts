import type { Character, Episode } from "./types.ts"
import type { Shot } from "./assets/types.ts"
import {
  AI_GENERATION_LABEL,
  AI_EXPORT_NOTICE,
  AI_PROVENANCE_PATH,
  type AiExportDisclosure,
} from "./export/ai-disclosure.ts"

export type ComplianceCode =
  | "minor-sexual"
  | "sexual-violence"
  | "hate-extremism"
  | "graphic-violence"
  | "illegal-instruction"
  | "self-harm-instruction"
  | "source-rights-review"

export interface ComplianceIssue {
  code: ComplianceCode
  severity: "warning" | "info"
  area: "content" | "rights"
  title: string
  evidence: string
  suggestion: string
  episode?: number
  shot?: number
}

export interface ComplianceAuditResult {
  issues: ComplianceIssue[]
  counts: {
    warning: number
    info: number
    total: number
  }
  disclosure: AiExportDisclosure
}

export interface ComplianceAuditInput {
  title: string
  idea: string
  characters: Character[]
  episodes: Episode[]
  shots: Shot[]
  sourceMaterials?: { name: string; content?: string }[]
}

interface ScanEntry {
  field: string
  text: string
  episode?: number
  shot?: number
}

interface Rule {
  code: ComplianceCode
  title: string
  pattern: RegExp
  suggestion: string
}

const RULES: Rule[] = [
  {
    code: "minor-sexual",
    title: "涉及未成年人的性化表达",
    pattern: /未成年.{0,8}(裸|性行为|色情|私密|陪睡)|儿童.{0,6}(色情|性交易)/i,
    suggestion: "删除相关表达，并交由人工按内容规则与平台政策复核。",
  },
  {
    code: "sexual-violence",
    title: "色情或性暴力表达",
    pattern: /强奸|性奴|强迫性行为|露骨性行为/i,
    suggestion: "改写为非露骨表达，并确认剧情呈现符合发布平台要求。",
  },
  {
    code: "hate-extremism",
    title: "仇恨或群体灭绝表达",
    pattern: /劣等民族|种族清洗|杀光.{0,4}(民族|人种|族群)/i,
    suggestion: "删除针对群体的贬损与灭绝表达，重新核对人物冲突的边界。",
  },
  {
    code: "graphic-violence",
    title: "极端暴力或猎奇伤害表达",
    pattern: /分尸|肢解|虐杀|挖眼|烹尸/i,
    suggestion: "改为不展示具体伤害过程的结果性描述，并评估平台尺度。",
  },
  {
    code: "illegal-instruction",
    title: "违法制作教程或可执行步骤",
    pattern: /炸弹制作|制毒|制爆|诈骗教程|洗钱教程|伪造证件教程/i,
    suggestion: "删除可执行步骤与教学式表达；剧情需要时只保留不含操作细节的冲突结果。",
  },
  {
    code: "self-harm-instruction",
    title: "自残或轻生教学式表达",
    pattern: /自杀方法|自残教程|轻生步骤/i,
    suggestion: "删除操作细节，避免可模仿内容；必要时补充求助与安全提示。",
  },
]

function compact(value: unknown, max = 80): string {
  const text = String(value ?? "").replace(/\s+/g, " ").trim()
  return text.length > max ? `${text.slice(0, max)}…` : text
}

function scanEntries(input: ComplianceAuditInput): ScanEntry[] {
  const entries: ScanEntry[] = [
    { field: "作品标题", text: input.title },
    { field: "故事想法", text: input.idea },
  ]
  for (const character of input.characters) {
    entries.push({
      field: `角色 · ${character.name}`,
      text: [character.identity, character.personality, character.motivation, character.arc].join(" "),
    })
  }
  for (const episode of input.episodes) {
    entries.push({
      field: `第 ${episode.number} 集 · 梗概/钩子`,
      text: `${episode.synopsis} ${episode.hook}`,
      episode: episode.number,
    })
  }
  for (const shot of input.shots) {
    entries.push({
      field: `第 ${shot.shot} 镜 · 动作/台词/提示词`,
      text: [shot.action, shot.dialogue, shot.prompt].join(" "),
      episode: shot.episode > 0 ? shot.episode : undefined,
      shot: shot.shot,
    })
  }
  return entries.filter((entry) => entry.text.trim())
}

export function auditCompliance(input: ComplianceAuditInput): ComplianceAuditResult {
  const issues: ComplianceIssue[] = []
  const seen = new Set<string>()
  for (const entry of scanEntries(input)) {
    for (const rule of RULES) {
      const match = entry.text.match(rule.pattern)
      if (!match) continue
      const key = `${rule.code}:${entry.field}`
      if (seen.has(key)) continue
      seen.add(key)
      issues.push({
        code: rule.code,
        severity: "warning",
        area: "content",
        title: rule.title,
        evidence: `${entry.field}：${compact(match[0])}`,
        suggestion: rule.suggestion,
        ...(entry.episode ? { episode: entry.episode } : {}),
        ...(entry.shot ? { shot: entry.shot } : {}),
      })
    }
  }

  const materials = input.sourceMaterials ?? []
  if (materials.length > 0) {
    issues.push({
      code: "source-rights-review",
      severity: "info",
      area: "rights",
      title: "改编原文前需要确认授权",
      evidence: `当前项目保存了 ${materials.length} 份原文素材：${materials
        .slice(0, 3)
        .map((material) => compact(material.name, 30))
        .join("、")}${materials.length > 3 ? " 等" : ""}`,
      suggestion: "发布或交付前确认拥有改编权、商用权与署名安排；本预检不读取原文全文。",
    })
  }

  const ordered = issues.slice(0, 30)
  return {
    issues: ordered,
    counts: {
      warning: ordered.filter((issue) => issue.severity === "warning").length,
      info: ordered.filter((issue) => issue.severity === "info").length,
      total: ordered.length,
    },
    disclosure: {
      schema: "chengju.ai-disclosure",
      schemaVersion: 1,
      label: AI_GENERATION_LABEL,
      notice: AI_EXPORT_NOTICE,
      provenancePath: AI_PROVENANCE_PATH,
      assetCount: 0,
      providers: [],
    },
  }
}

import {
  DEFAULT_COST_CONFIG,
  estimateBudget,
} from "../assets/cost.ts"
import type {
  Shot,
  VisualCharacter,
  VisualPlace,
} from "../assets/types.ts"
import { preflightPlatformExport } from "../export/platforms.ts"

export type DeterministicSkillId = "delivery" | "cost"

export interface SkillReportMetric {
  label: string
  value: string
}

export interface SkillReportItem {
  severity: "blocking" | "warning" | "info"
  title: string
  detail: string
}

export interface DeterministicSkillReport {
  skill: DeterministicSkillId
  title: string
  projectTitle: string
  summary: string
  metrics: SkillReportMetric[]
  items: SkillReportItem[]
  tips: string[]
  readOnly: true
  writes: false
  modelCalls: 0
  quotaCharged: 0
}

function shotTitle(episode: number, shot: number, suffix?: string): string {
  const position = episode > 0 ? `第 ${episode} 集 · 第 ${shot} 镜` : `未标集 · 第 ${shot} 镜`
  return suffix ? `${position} · ${suffix}` : position
}

export function buildDeliverySkillReport(input: {
  projectTitle: string
  shots: Shot[]
  visuals: VisualCharacter[]
  places: VisualPlace[]
}): DeterministicSkillReport {
  const preflight = preflightPlatformExport(input.shots, {
    target: "jimeng",
    visuals: input.visuals,
    places: input.places,
  })
  const items: SkillReportItem[] = preflight.issues
    .map((issue) => ({
      severity: issue.severity,
      title: shotTitle(issue.episode, issue.shot, issue.character),
      detail: issue.message,
    }))
    .sort((left, right) => {
      if (left.severity !== right.severity) return left.severity === "blocking" ? -1 : 1
      return left.title.localeCompare(right.title, "zh-CN")
    })

  return {
    skill: "delivery",
    title: "即梦 / 可灵交付预检",
    projectTitle: input.projectTitle,
    summary: input.shots.length === 0
      ? "当前项目还没有分镜，无法执行平台交付预检。"
      : preflight.blocking === 0 && preflight.warning === 0
        ? `已检查 ${input.shots.length} 镜，当前没有发现平台交付问题。`
        : `已检查 ${input.shots.length} 镜，发现 ${preflight.blocking} 个阻断项、${preflight.warning} 个提醒项。`,
    metrics: [
      { label: "检查镜头", value: String(input.shots.length) },
      { label: "阻断项", value: String(preflight.blocking) },
      { label: "提醒项", value: String(preflight.warning) },
    ],
    items,
    tips: [
      "阻断项需要修正后再导出到即梦或可灵。",
      "时长只接受 5 秒或 10 秒，画幅只接受 9:16 或 16:9。",
      "检查基于项目最新分镜快照，不调用模型、不扣额度。",
    ],
    readOnly: true,
    writes: false,
    modelCalls: 0,
    quotaCharged: 0,
  }
}

export function buildCostSkillReport(input: {
  projectTitle: string
  shots: Shot[]
}): DeterministicSkillReport {
  if (input.shots.length === 0) {
    return {
      skill: "cost",
      title: "短剧生成成本规划",
      projectTitle: input.projectTitle,
      summary: "当前项目还没有分镜，暂时无法估算视频生成成本。",
      metrics: [
        { label: "预计总成本", value: "¥0" },
        { label: "镜头数", value: "0" },
        { label: "高风险镜头", value: "0" },
      ],
      items: [],
      tips: ["先生成分镜，再按镜头时长、参考图和动作复杂度估算成本。"],
      readOnly: true,
      writes: false,
      modelCalls: 0,
      quotaCharged: 0,
    }
  }

  const budget = estimateBudget(input.shots, DEFAULT_COST_CONFIG)
  const costly = [...budget.rows]
    .sort((left, right) => right.expectedCost - left.expectedCost)
    .slice(0, 6)
  const items: SkillReportItem[] = costly.map((row) => ({
    severity: row.highRisk ? "warning" : "info",
    title: shotTitle(row.episode, row.shot),
    detail: `预计 ¥${row.expectedCost.toFixed(2)} · 可用率 ${Math.round(row.usability * 100)}%${row.suggestions.length ? ` · ${row.suggestions[0]}` : ""}`,
  }))

  return {
    skill: "cost",
    title: "短剧生成成本规划",
    projectTitle: input.projectTitle,
    summary: `按 ${budget.tier} 当前口径估算，${input.shots.length} 镜预计 ¥${budget.totalExpectedCost.toFixed(2)}，其中参考图超量费约 ¥${budget.totalRefCost.toFixed(2)}。`,
    metrics: [
      { label: "预计总成本", value: `¥${budget.totalExpectedCost.toFixed(2)}` },
      { label: "镜头数", value: String(input.shots.length) },
      { label: "高风险镜头", value: String(budget.highRiskShots.length) },
    ],
    items,
    tips: budget.tips,
    readOnly: true,
    writes: false,
    modelCalls: 0,
    quotaCharged: 0,
  }
}

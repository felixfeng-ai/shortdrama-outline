// Agent 的第一道路由。确定性的请求先用规则分流，避免每次都消耗模型调用。
import type { ProjectType } from "../production/types.ts"

export type AgentIntent =
  | "quick_video"
  | "drama_from_source"
  | "drama_continue"
  | "production_review"
  | "canvas_orchestration"
  | "marketing_plan"

export interface AgentIntentResult {
  intent: AgentIntent
  label: string
  recommendedAction: string
  projectType?: ProjectType
  requiresProject: boolean
  confidence: number
}

const INTENTS: Record<AgentIntent, Omit<AgentIntentResult, "intent">> = {
  quick_video: {
    label: "快速创作",
    recommendedAction: "进入统一快速创作入口，先选择故事、首帧或单镜头视频范围，再确认一次预算。",
    requiresProject: false,
    confidence: 0.9,
  },
  drama_from_source: {
    label: "小说 / 剧本改编",
    recommendedAction: "先读取来源目录和章节，再提出样片规模与改编边界。",
    projectType: "drama",
    requiresProject: true,
    confidence: 0.92,
  },
  drama_continue: {
    label: "继续短剧制作",
    recommendedAction: "读取当前生产阶段，只处理缺失或过期内容。",
    projectType: "drama",
    requiresProject: true,
    confidence: 0.82,
  },
  production_review: {
    label: "连续性与门禁检查",
    recommendedAction: "读取项目事实、Canon 和任务状态，列出具体阻断。",
    projectType: "drama",
    requiresProject: true,
    confidence: 0.88,
  },
  canvas_orchestration: {
    label: "自由画布编排",
    recommendedAction: "在自由画布提出节点方案，结果必须经用户确认后才能应用。",
    projectType: "drama",
    requiresProject: true,
    confidence: 0.86,
  },
  marketing_plan: {
    label: "营销视频策划",
    recommendedAction: "按营销项目理解目标、受众和投放渠道，再生成广告变体。",
    projectType: "marketing",
    requiresProject: true,
    confidence: 0.9,
  },
}

function hasAny(text: string, terms: readonly string[]): boolean {
  return terms.some((term) => text.includes(term))
}

export function detectAgentIntent(input: string): AgentIntentResult {
  const text = input.trim().toLowerCase()
  const make = (intent: AgentIntent): AgentIntentResult => ({ intent, ...INTENTS[intent] })

  if (hasAny(text, ["营销", "广告", "投放", "小红书", "商品视频", "转化", "广告变体"])) {
    return make("marketing_plan")
  }
  if (hasAny(text, ["小说", "剧本", "原文", "改编", "导入"]) && hasAny(text, ["短剧", "视频", "样片", "分集"])) {
    return make("drama_from_source")
  }
  if (
    hasAny(text, ["一句话", "快速出片", "单条视频", "单个视频", "10 秒视频", "10秒视频"])
    || (/短视频/.test(text) && !hasAny(text, ["短剧", "分集", "整季"]))
  ) {
    return make("quick_video")
  }
  if (hasAny(text, ["画布", "节点", "连线", "编排", "工作流"])) {
    return make("canvas_orchestration")
  }
  if (hasAny(text, ["检查", "审核", "连续性", "缺图", "缺失", "过期", "返修", "质量", "门禁"])) {
    return make("production_review")
  }
  return make("drama_continue")
}

/** 把意图写进系统提示，给模型明确的任务边界，而不是只做标签展示。 */
export function buildAgentIntentSystemBlock(intent: AgentIntentResult): string {
  return [
    "## 本轮 Agent 意图",
    `intent: ${intent.intent}`,
    `role: ${intent.label}`,
    `recommendedAction: ${intent.recommendedAction}`,
    "执行边界：不得覆盖已批准的人物、正文、镜头、首帧、视频或声音版本。",
    intent.intent === "drama_from_source"
      ? "来源改编先提出样片 1-3 集方案，确认后再扩成小批或整季。"
      : "涉及写入、扩集、付费生成或应用到项目时，先展示影响范围并等待用户确认。",
  ].join("\n")
}

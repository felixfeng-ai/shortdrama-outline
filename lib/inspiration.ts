import { GENRES, readGenre, type Genre } from "./types.ts"
import { genreClause } from "./prompts.ts"

export type InspirationAudience = "female" | "male" | "general" | "unknown"
export type InspirationEmotion =
  | "payoff"
  | "romance"
  | "angst"
  | "suspense"
  | "family"
  | "healing"
  | "fantasy"
  | "unknown"
export type InspirationConstraint =
  | "low-cost"
  | "limited-cast"
  | "costume"
  | "fantasy"
  | "balanced"
export type InspirationDifficulty = "low" | "medium" | "high"
export type InspirationTrend = "rising" | "steady" | "cooling"

export interface InspirationChoice<T extends string> {
  id: T
  label: string
  hint: string
}

export interface InspirationInput {
  audience: InspirationAudience
  emotion: InspirationEmotion
  constraint: InspirationConstraint
  keywords: string
  genreId: string
  signalId: string
}

export interface CreativeSeed {
  title: string
  logline: string
  audienceLabel: string
  hook3s: string
  conflict: string
  emotionalPayoff: string
  differentiation: string
  genreId: string
  castCount: number
  locationCount: number
  difficulty: InspirationDifficulty
  costBand: InspirationDifficulty
  risk: string
  sourceSignalId: string
}

export interface InspirationRadarSignal {
  id: string
  name: string
  summary: string
  audience: InspirationAudience
  emotion: InspirationEmotion
  trope: string
  structure: string
  trend: InspirationTrend
  crowding: InspirationDifficulty
  productionDifficulty: InspirationDifficulty
  complianceRisk: InspirationDifficulty
  sourceLabel: string
  sourceUrl: string
  capturedAt: string
  disclaimer: string
}

export interface InspirationRadar {
  capturedAt: string
  disclaimer: string
  signals: InspirationRadarSignal[]
}

export const INSPIRATION_AUDIENCES: InspirationChoice<InspirationAudience>[] = [
  { id: "female", label: "女频", hint: "情感、关系与成长驱动" },
  { id: "male", label: "男频", hint: "目标、逆袭与能力成长驱动" },
  { id: "general", label: "泛人群", hint: "家庭、悬疑与现实共情" },
  { id: "unknown", label: "不确定", hint: "由平台给出三种不同观众方向" },
]

export const INSPIRATION_EMOTIONS: InspirationChoice<InspirationEmotion>[] = [
  { id: "payoff", label: "爽感逆袭", hint: "被低估的人完成当众翻盘" },
  { id: "romance", label: "甜宠心动", hint: "关系反差与高频互动" },
  { id: "angst", label: "虐恋拉扯", hint: "误会、牺牲与破镜重圆" },
  { id: "suspense", label: "悬疑反转", hint: "信息差推动连续追看" },
  { id: "family", label: "家庭共情", hint: "亲情责任与现实压力" },
  { id: "healing", label: "治愈成长", hint: "从困境走向主动选择" },
  { id: "fantasy", label: "奇幻脑洞", hint: "现实规则被替换或打破" },
  { id: "unknown", label: "不确定", hint: "由平台组合不同情绪" },
]

export const INSPIRATION_CONSTRAINTS: InspirationChoice<InspirationConstraint>[] = [
  { id: "low-cost", label: "现代低成本", hint: "室内、少场景、无复杂特效" },
  { id: "limited-cast", label: "少角色", hint: "优先三到五个主要角色" },
  { id: "costume", label: "古装或年代", hint: "服化道和场景要求更高" },
  { id: "fantasy", label: "玄幻特效", hint: "允许异能与奇幻规则" },
  { id: "balanced", label: "不做限制", hint: "先保证创意，再评估制作成本" },
]

const AUDIENCE_LABELS = new Map(INSPIRATION_AUDIENCES.map((item) => [item.id, item.label]))
const EMOTION_LABELS = new Map(INSPIRATION_EMOTIONS.map((item) => [item.id, item.label]))
const CONSTRAINT_LABELS = new Map(INSPIRATION_CONSTRAINTS.map((item) => [item.id, item.label]))
const DIFFICULTIES = new Set<InspirationDifficulty>(["low", "medium", "high"])

function text(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : ""
}

function oneOf<T extends string>(value: unknown, values: T[], fallback: T): T {
  return typeof value === "string" && values.includes(value as T) ? value as T : fallback
}

export function readInspirationInput(raw: unknown): InspirationInput {
  const source = raw && typeof raw === "object" ? raw as Record<string, unknown> : {}
  return {
    audience: oneOf(
      source.audience,
      INSPIRATION_AUDIENCES.map((item) => item.id),
      "unknown",
    ),
    emotion: oneOf(
      source.emotion,
      INSPIRATION_EMOTIONS.map((item) => item.id),
      "unknown",
    ),
    constraint: oneOf(
      source.constraint,
      INSPIRATION_CONSTRAINTS.map((item) => item.id),
      "balanced",
    ),
    keywords: text(source.keywords, 120),
    genreId: readGenre(source.genreId).id,
    signalId: text(source.signalId, 80),
  }
}

const RADAR_CAPTURED_AT = "2026-11-10"
const RADAR_DISCLAIMER =
  "编辑整理的公开创作风向样本，非实时排名。热度是选题参考，不代表平台官方推荐或收益承诺。"

const RADAR_SIGNALS: InspirationRadarSignal[] = [
  {
    id: "female-reality-growth",
    name: "现实大女主成长",
    summary: "普通女性在家庭或职场压力中从被动承受转向主动解决。",
    audience: "female",
    emotion: "family",
    trope: "被低估的女性掌握关键能力",
    structure: "现实困境 → 被误解 → 找到证据或能力 → 主动反击 → 获得新选择",
    trend: "rising",
    crowding: "medium",
    productionDifficulty: "low",
    complianceRisk: "low",
    sourceLabel: "番茄短故事公开改编风向",
    sourceUrl: "https://fanqienovel.com/writer/zone/article/7678898394189791256",
    capturedAt: RADAR_CAPTURED_AT,
    disclaimer: RADAR_DISCLAIMER,
  },
  {
    id: "urban-reversal",
    name: "都市身份逆袭",
    summary: "被低估的普通人因一次关键事件暴露真实能力。",
    audience: "male",
    emotion: "payoff",
    trope: "隐藏身份与当众翻盘",
    structure: "被轻视 → 关键危机 → 能力露出 → 对手误判 → 身份反转",
    trend: "steady",
    crowding: "high",
    productionDifficulty: "low",
    complianceRisk: "low",
    sourceLabel: "番茄公开创作风向",
    sourceUrl: "https://fanqienovel.com/writer/zone/article/7616327014571573272",
    capturedAt: RADAR_CAPTURED_AT,
    disclaimer: RADAR_DISCLAIMER,
  },
  {
    id: "sweet-reunion",
    name: "破镜重圆与先婚后爱",
    summary: "旧关系在新危机中被迫重新合作，通过行动修复误解。",
    audience: "female",
    emotion: "romance",
    trope: "旧关系重启",
    structure: "重逢 → 旧误会被揭开 → 被迫合作 → 新选择 → 关系确认",
    trend: "steady",
    crowding: "high",
    productionDifficulty: "low",
    complianceRisk: "low",
    sourceLabel: "番茄公开题材风向",
    sourceUrl: "https://fanqienovel.com/writer/zone/article/7616327014571573272",
    capturedAt: RADAR_CAPTURED_AT,
    disclaimer: RADAR_DISCLAIMER,
  },
  {
    id: "family-suspense",
    name: "家庭共情微悬疑",
    summary: "从家庭日常切入一个必须追查清楚的秘密。",
    audience: "general",
    emotion: "suspense",
    trope: "亲情关系与信息差",
    structure: "日常异常 → 家人隐瞒 → 追查线索 → 关系冲突 → 真相与选择",
    trend: "rising",
    crowding: "medium",
    productionDifficulty: "low",
    complianceRisk: "medium",
    sourceLabel: "番茄短故事公开改编风向",
    sourceUrl: "https://fanqienovel.com/writer/zone/article/7701999180897599550",
    capturedAt: RADAR_CAPTURED_AT,
    disclaimer: RADAR_DISCLAIMER,
  },
  {
    id: "urban-fantasy",
    name: "都市脑洞与奇幻规则",
    summary: "现实都市中出现一条必须付出代价的新规则。",
    audience: "general",
    emotion: "fantasy",
    trope: "普通人进入异常规则",
    structure: "日常触发 → 规则显现 → 代价升级 → 找到漏洞 → 新规则成立",
    trend: "rising",
    crowding: "medium",
    productionDifficulty: "medium",
    complianceRisk: "low",
    sourceLabel: "番茄公开题材风向",
    sourceUrl: "https://fanqienovel.com/writer/zone/article/7616327014571573272",
    capturedAt: RADAR_CAPTURED_AT,
    disclaimer: RADAR_DISCLAIMER,
  },
  {
    id: "costume-revenge",
    name: "古风权谋与复仇",
    summary: "主角在家门、婚约与身份困局中依靠行动完成反制。",
    audience: "female",
    emotion: "payoff",
    trope: "古风关系与延时反击",
    structure: "被压迫 → 隐忍取证 → 关系翻转 → 布局反制 → 夺回选择权",
    trend: "steady",
    crowding: "medium",
    productionDifficulty: "high",
    complianceRisk: "medium",
    sourceLabel: "番茄公开创作风向",
    sourceUrl: "https://fanqienovel.com/writer/zone/article/7697081389316833342",
    capturedAt: RADAR_CAPTURED_AT,
    disclaimer: RADAR_DISCLAIMER,
  },
]

export function getInspirationRadar(): InspirationRadar {
  return {
    capturedAt: RADAR_CAPTURED_AT,
    disclaimer: RADAR_DISCLAIMER,
    signals: RADAR_SIGNALS.map((signal) => ({ ...signal })),
  }
}

export function findInspirationSignal(id: string): InspirationRadarSignal | null {
  return RADAR_SIGNALS.find((signal) => signal.id === id) ?? null
}

export function buildInspirationPrompt(input: InspirationInput): {
  system: string
  user: string
} {
  const signal = findInspirationSignal(input.signalId)
  const genre = readGenre(input.genreId)
  const system = `你是短剧创意制片人，负责把模糊需求变成能立即进入六步工作流的故事方向。

必须遵守：
- 正好生成 3 个 creativeSeeds。
- 三个方向在人物关系、核心冲突和情绪落点上必须不同，不能只换名字、地点或职业。
- 不得复制任何真实剧名、小说标题、人物组合或完整剧情。
- 市场题材只作为结构参考，必须加入新的职业、关系或现实问题形成差异。
- 每个方向都要考虑 AI 短剧制作可行性，优先可拍、可控制成本、可连续展开的故事。
- 不虚构热度、播放量、收益或官方推荐。
- 文字使用可直接展示给用户的中文。

只输出 JSON：
{
  "creativeSeeds": [
    {
      "title": "不超过 18 字的原创方向名",
      "logline": "一句完整故事，不超过 80 字",
      "audienceLabel": "目标观众",
      "hook3s": "3 秒内发生的异常、冲突或问题",
      "conflict": "可持续升级的核心冲突",
      "emotionalPayoff": "观众最终获得的情绪",
      "differentiation": "与热门常见写法的具体差异",
      "genreId": "必须来自题材清单",
      "castCount": 3,
      "locationCount": 2,
      "difficulty": "low | medium | high",
      "costBand": "low | medium | high",
      "risk": "制作或合规风险，最多 40 字"
    }
  ]
}

题材清单：${GENRES.filter((item) => item.id !== "none").map((item) => `${item.id}=${item.label}`).join("，")}${genreClause(genre)}`

  const user = `目标观众：${AUDIENCE_LABELS.get(input.audience)}
核心情绪：${EMOTION_LABELS.get(input.emotion)}
制作约束：${CONSTRAINT_LABELS.get(input.constraint)}
补充关键词：${input.keywords || "无"}
题材偏好：${genre.id === "none" ? "不限定" : genre.label}
市场结构参考：${signal ? `${signal.name}；${signal.structure}；${signal.summary}` : "无，按用户条件原创"}

请生成三个差异化方向。`

  return { system, user }
}

function difficulty(value: unknown, fallback: InspirationDifficulty): InspirationDifficulty {
  return typeof value === "string" && DIFFICULTIES.has(value as InspirationDifficulty)
    ? value as InspirationDifficulty
    : fallback
}

function boundedCount(value: unknown, fallback: number): number {
  const number = Math.floor(Number(value))
  return Number.isFinite(number) ? Math.max(1, Math.min(30, number)) : fallback
}

export function normalizeCreativeSeeds(raw: unknown): CreativeSeed[] {
  const source = raw && typeof raw === "object" ? raw as Record<string, unknown> : {}
  const list = Array.isArray(source.creativeSeeds) ? source.creativeSeeds : []
  const seen = new Set<string>()
  const seeds: CreativeSeed[] = []

  for (const item of list) {
    if (!item || typeof item !== "object") continue
    const row = item as Record<string, unknown>
    const title = text(row.title, 36)
    const logline = text(row.logline, 180)
    if (!title || !logline) continue
    const key = logline.replace(/\s+/g, "")
    if (seen.has(key)) continue
    seen.add(key)
    const genre = readGenre(row.genreId)
    seeds.push({
      title,
      logline,
      audienceLabel: text(row.audienceLabel, 30) || "泛人群",
      hook3s: text(row.hook3s, 100) || "首屏需要一个明确的异常或冲突。",
      conflict: text(row.conflict, 100) || "核心冲突需要在制作前进一步具体化。",
      emotionalPayoff: text(row.emotionalPayoff, 60) || "从被动承受走向主动选择。",
      differentiation: text(row.differentiation, 100) || "需要用新的职业或关系细节建立差异。",
      genreId: genre.id,
      castCount: boundedCount(row.castCount, 4),
      locationCount: boundedCount(row.locationCount, 3),
      difficulty: difficulty(row.difficulty, "medium"),
      costBand: difficulty(row.costBand, "medium"),
      risk: text(row.risk, 80) || "制作与合规风险需要进一步评估。",
      sourceSignalId: text(row.sourceSignalId, 80),
    })
    if (seeds.length === 3) break
  }
  return seeds
}

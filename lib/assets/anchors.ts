// 锚点编译器：把 VisualCharacter 编译成一段英文锚点串。
//
// 这是整个产品的技术核心（SDD v0.2 B1/B5）。
// 设计要求：
//   1. 幂等 —— 同一份 VisualCharacter 编译两次结果必须逐字相同
//      （否则同一角色在不同镜头里的 prompt 会不一致，锚点就失去意义）
//   2. 确定性顺序 —— 字段顺序固定，不依赖对象键遍历顺序
//   3. 空字段跳过 —— 用户没填的项不能编译出 "undefined" 或空括号
import {
  DEFAULT_LOCKED_VISUAL_TRAITS,
  VISUAL_TRAIT_KEYS,
  type Shot,
  type VisualCharacter,
  type VisualPlace,
  type VisualTraitKey,
} from "./types.ts"

/** 参与编译的字段集合（id/name/anchor 不参与） */
type AnchorField = VisualTraitKey

/** 中文字段的英文标签。顺序即编译顺序，必须稳定 */
const FIELD_LABELS: { key: AnchorField; label: string }[] = [
  { key: "age", label: "age" },
  { key: "face", label: "face" },
  { key: "hair", label: "hair" },
  { key: "marks", label: "distinguishing feature" },
  { key: "wardrobe", label: "wearing" },
  { key: "props", label: "carrying" },
]

const TRAIT_LABELS: Record<VisualTraitKey, string> = {
  age: "年龄",
  face: "脸型五官",
  hair: "发型",
  marks: "辨识特征",
  wardrobe: "服装",
  props: "道具",
}

export function visualTraitLabel(key: VisualTraitKey): string {
  return TRAIT_LABELS[key] ?? key
}

/**
 * 编译锚点串。
 * 只保留有内容的字段；全部为空时返回空串（调用方需处理）。
 */
export function compileAnchor(vc: Pick<VisualCharacter, "age" | "face" | "hair" | "marks" | "wardrobe" | "props">): string {
  const parts: string[] = []
  for (const { key, label } of FIELD_LABELS) {
    const value = (vc[key] ?? "").toString().trim()
    if (value) parts.push(`${label}: ${value}`)
  }
  return parts.join(", ")
}

export interface LockedTraitIssue {
  shot: number
  character: string
  traits: VisualTraitKey[]
}

/** 找出这一镜缺少了角色的哪些禁改项。没有锚点的角色不参与，避免误报。 */
export function missingLockedTraits(prompt: string, visual: VisualCharacter): VisualTraitKey[] {
  if (!visual.anchor?.trim()) return []
  const locked = visual.lockedTraits ?? [...DEFAULT_LOCKED_VISUAL_TRAITS]
  return locked.filter((key) => {
    if (!VISUAL_TRAIT_KEYS.includes(key)) return false
    const value = String(visual[key] ?? "").trim()
    if (!value) return false
    const label = FIELD_LABELS.find((field) => field.key === key)?.label
    return !!label && !prompt.includes(`${label}: ${value}`)
  })
}

/** 全片禁改项审计：只返回确实缺项的镜头，供版本提示精确到人与字段。 */
export function auditLockedTraits(shots: Shot[], visuals: VisualCharacter[]): LockedTraitIssue[] {
  const byName = new Map(visuals.map((visual) => [visual.name, visual]))
  const issues: LockedTraitIssue[] = []

  for (const shot of shots) {
    for (const name of shot.characters ?? []) {
      const visual = byName.get(name)
      if (!visual) continue
      const traits = missingLockedTraits(shot.prompt ?? "", visual)
      if (traits.length > 0) issues.push({ shot: shot.shot, character: name, traits })
    }
  }
  return issues
}

// ── 地点锚点 ───────────────────────────────────────────────────

/** 参与地点锚点编译的字段（id/name/anchor 不参与） */
type PlaceAnchorField = "space" | "props" | "lighting" | "grade"

/** 顺序即编译顺序，必须稳定——和角色锚点同一个理由：幂等才能逐字复用 */
const PLACE_FIELD_LABELS: { key: PlaceAnchorField; label: string }[] = [
  { key: "space", label: "space" },
  { key: "props", label: "set dressing" },
  { key: "lighting", label: "lighting" },
  { key: "grade", label: "color grade" },
]

/** 编译地点锚点串。只保留有内容的字段；全空返回空串（调用方需处理） */
export function compilePlaceAnchor(p: Pick<VisualPlace, PlaceAnchorField>): string {
  const parts: string[] = []
  for (const { key, label } of PLACE_FIELD_LABELS) {
    const value = (p[key] ?? "").toString().trim()
    if (value) parts.push(`${label}: ${value}`)
  }
  return parts.join(", ")
}

/**
 * 由地点锚点派生出「场景图」的出图提示词。
 *
 * 为什么不让模型单独写一份（像定妆图那样）：锚点本身就是完整的视觉规格，
 * 再让模型写一遍等于把同一件事说两遍——我们已经因为「同一件事说两遍」
 * 栽过一次（锚点被改写成英文后又追加中文原文）。这里用纯函数派生，
 * 零 token 成本、零漂移。
 *
 * 为什么要强调空场景：场景图是给图像模型当参考用的，站了人反而会污染
 * 后续镜头的人物条件；房间里该有的陈设由锚点自己带。
 */
export function buildPlaceImagePrompt(place: Pick<VisualPlace, "anchor">): string {
  const anchor = (place.anchor ?? "").trim()
  if (!anchor) return ""
  return `${anchor}. Empty location reference shot, no people, no characters, wide establishing view, even lighting, cinematic realistic style`
}

/**
 * 把角色锚点注入镜头 prompt。
 *
 * 为什么需要它：模型经常「理解并改写」锚点（把「沙色短夹克」写成「米色外套」），
 * 一旦改写，跨镜头一致性就崩了。所以这里做后校验：
 *   - anchor 已在 prompt 中 → 原样返回
 *   - 未包含 → 追加到 prompt 末尾（保证硬约束成立）
 */
export function injectAnchor(prompt: string, anchor: string): string {
  const cleanPrompt = prompt.trim()
  const cleanAnchor = anchor.trim()
  if (!cleanAnchor) return cleanPrompt                       // 没有锚点，无从注入
  if (cleanPrompt.includes(cleanAnchor)) return cleanPrompt  // 已包含，不重复
  return cleanPrompt ? `${cleanPrompt}, ${cleanAnchor}` : cleanAnchor
}

/** 检查一个镜头的 prompt 是否已内嵌所有出场角色的锚点（供影响范围/校验使用） */
export function hasAllAnchors(
  prompt: string,
  characters: string[],
  visuals: VisualCharacter[],
): boolean {
  const byName = new Map(visuals.map((v) => [v.name, v]))
  for (const name of characters) {
    const vc = byName.get(name)
    if (!vc?.anchor?.trim()) continue   // 该角色没有锚点，不参与判断
    if (!prompt.includes(vc.anchor.trim())) return false
  }
  return true
}

/**
 * 统计一批镜头里，有多少个镜头的提示词缺了当前锚点。
 *
 * 为什么需要它：界面上要能说出「改了定妆之后，有 3 个镜头得重做」。这句话的
 * 判断口径只有一条——出场角色的锚点是否逐字出现在提示词里（即 hasAllAnchors）。
 *
 * 曾经这里算的是「还没做完的镜头数」，那是用户的拍摄进度，不是改动的影响面，
 * 两个数摆在一起会互相误导：一镜没做的项目看起来像改坏了，全部做完的项目看起来像没影响。
 */
export function countShotsMissingAnchors(
  shots: Pick<Shot, "prompt" | "characters">[],
  visuals: VisualCharacter[],
): number {
  let count = 0
  for (const shot of shots) {
    if (!hasAllAnchors(shot.prompt, shot.characters, visuals)) count += 1
  }
  return count
}

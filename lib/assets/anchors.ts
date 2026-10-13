// 锚点编译器：把 VisualCharacter 编译成一段英文锚点串。
//
// 这是整个产品的技术核心（SDD v0.2 B1/B5）。
// 设计要求：
//   1. 幂等 —— 同一份 VisualCharacter 编译两次结果必须逐字相同
//      （否则同一角色在不同镜头里的 prompt 会不一致，锚点就失去意义）
//   2. 确定性顺序 —— 字段顺序固定，不依赖对象键遍历顺序
//   3. 空字段跳过 —— 用户没填的项不能编译出 "undefined" 或空括号
import type { VisualCharacter } from "./types.ts"

/** 参与编译的字段集合（id/name/anchor 不参与） */
type AnchorField = "age" | "face" | "hair" | "marks" | "wardrobe" | "props"

/** 中文字段的英文标签。顺序即编译顺序，必须稳定 */
const FIELD_LABELS: { key: AnchorField; label: string }[] = [
  { key: "age", label: "age" },
  { key: "face", label: "face" },
  { key: "hair", label: "hair" },
  { key: "marks", label: "distinguishing feature" },
  { key: "wardrobe", label: "wearing" },
  { key: "props", label: "carrying" },
]

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

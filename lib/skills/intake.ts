export type IntakeMode = "idea" | "source" | "project"

export interface IntakeModeDefinition {
  id: IntakeMode
  label: string
  short: string
  placeholder: string
  hint: string
}

export const INTAKE_MODES: readonly IntakeModeDefinition[] = [
  {
    id: "idea",
    label: "从想法开始",
    short: "想法",
    placeholder: "写下故事灵感，例如：一个快递员意外继承了百万遗产…",
    hint: "先探索方向，不要求已有完整故事。",
  },
  {
    id: "source",
    label: "从小说剧本开始",
    short: "原文",
    placeholder: "粘贴小说、剧本或大纲原文，或加入 TXT / Markdown 文件…",
    hint: "原文会作为当前项目素材参与改编，不会伪装成已解析其他格式。",
  },
  {
    id: "project",
    label: "继续当前项目",
    short: "项目",
    placeholder: "告诉场记这一步要检查、修改或继续什么…",
    hint: "读取当前项目已有产物，写入前仍会向你确认。",
  },
] as const

export interface IntakeProjectState {
  hasIdea: boolean
  materialCount: number
  characters: number
  acts: number
  episodes: number
  visuals: number
  scenes: number
  shots: number
}

export interface SkillReadiness {
  ready: boolean
  missing: string[]
}

export function assessSkillReadiness(
  skillId: string,
  state: IntakeProjectState,
): SkillReadiness {
  const missing: string[] = []
  if (skillId === "adaptation" && state.materialCount === 0) {
    missing.push("小说 / 剧本原文")
  } else if (skillId === "story-doctor" && state.episodes === 0 && state.acts === 0 && !state.hasIdea) {
    missing.push("分集或三幕大纲")
  } else if (skillId === "canon" && state.characters + state.visuals + state.scenes + state.shots === 0) {
    missing.push("人物、视觉、场次或分镜")
  } else if (
    (skillId === "continuity" || skillId === "delivery")
    && state.shots === 0
  ) {
    missing.push("分镜")
  } else if (skillId === "cost" && state.shots === 0 && state.episodes === 0) {
    missing.push("分集或分镜")
  }
  return { ready: missing.length === 0, missing }
}

interface MaterialContextInput {
  name: string
  kind: string
  characterCount: number
  content: string
}

export function buildMaterialContext(
  materials: readonly MaterialContextInput[],
  maxChars = 12_000,
): string {
  if (materials.length === 0 || maxChars <= 0) return ""
  const chunks: string[] = []
  let used = 0
  let truncated = false

  for (const material of materials) {
    const header = `【项目原文：${material.name} · ${material.kind} · ${material.characterCount} 字】\n`
    const remaining = maxChars - used - header.length
    if (remaining < 24) {
      truncated = true
      break
    }
    const content = Array.from(material.content)
    const picked = content.slice(0, remaining).join("")
    const piece = picked.length < content.length ? `${picked}\n（原文过长，已截断）` : picked
    const block = `${header}${piece}\n\n`
    chunks.push(block)
    used += block.length
    if (picked.length < content.length) {
      truncated = true
      break
    }
  }

  const result = chunks.join("").trim()
  if (!truncated) return result
  return `${result}\n\n【上下文说明：项目原文超出本轮到字数预算，已截断】`
}

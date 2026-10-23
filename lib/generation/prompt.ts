import type { VisualCharacter } from "../assets/types.ts"
import { isLookEmpty, type LookBook } from "../look.ts"

type CharacterLike = Pick<
  VisualCharacter,
  "name" | "anchor" | "age" | "face" | "hair" | "marks" | "wardrobe" | "props"
>

export function buildCharacterKeyframePrompt(character: CharacterLike): string {
  const anchor = character.anchor.trim() || [
    character.age && `age: ${character.age}`,
    character.face && `face: ${character.face}`,
    character.hair && `hair: ${character.hair}`,
    character.marks && `distinguishing marks: ${character.marks}`,
    character.wardrobe && `wardrobe: ${character.wardrobe}`,
    character.props && `props: ${character.props}`,
  ].filter(Boolean).join("; ")

  return [
    `Character reference portrait of ${character.name || "the protagonist"}.`,
    anchor,
    "Full body visible, neutral dark studio background, consistent facial identity, cinematic production still, natural skin texture, controlled soft light.",
    "No text, no captions, no watermark, no logo, no extra people.",
  ].filter(Boolean).join(" ")
}

export function buildImageStyleDirective(look: LookBook | undefined): string {
  if (!look || isLookEmpty(look)) return ""
  const parts = [
    look.palette && `Color palette: ${look.palette}.`,
    look.light && `Lighting: ${look.light}.`,
    look.lens && `Lens language: ${look.lens}.`,
    look.banned && `Avoid: ${look.banned}.`,
  ].filter(Boolean)
  return `Project visual direction, keep it consistent across all keyframes. ${parts.join(" ")}`
}

export function withImageStyle(prompt: string, look: LookBook | undefined): string {
  const base = prompt.trim()
  const directive = buildImageStyleDirective(look)
  if (!directive) return base
  if (base.includes("## 视觉宪法") || base.includes("Project visual direction")) return base
  return `${base}\n\n${directive}`
}

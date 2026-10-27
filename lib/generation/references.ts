import type { GeneratedAsset, GenerationTargetType } from "./types.ts"
import { placeGenerationTargetId } from "../assets/anchors.ts"

export interface GenerationReferenceCandidate {
  asset: GeneratedAsset
  label: string
  role: "identity" | "location" | "style"
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {}
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(record) : []
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

export function selectGenerationReferenceCandidates(input: {
  targetType: GenerationTargetType
  targetId: string
  shots: unknown
  visualCharacters: unknown
  visualPlaces?: unknown
  assets: GeneratedAsset[]
}): GenerationReferenceCandidate[] {
  const visuals = records(input.visualCharacters)
  const labelsByEntity = new Map<string, string>()
  const entityByName = new Map<string, string>()
  for (const visual of visuals) {
    const name = text(visual.name)
    const entityId = text(visual.entityId)
    if (!name || !entityId) continue
    labelsByEntity.set(entityId, name)
    entityByName.set(name, entityId)
  }

  const selected = input.assets
    .filter((asset) => asset.selectedAt !== null)
    .sort((left, right) => right.createdAt - left.createdAt)
  const latestCharacterByTarget = new Map<string, GeneratedAsset>()
  const latestPlaceByTarget = new Map<string, GeneratedAsset>()
  for (const asset of selected) {
    if (asset.targetType === "character" && !latestCharacterByTarget.has(asset.targetId)) {
      latestCharacterByTarget.set(asset.targetId, asset)
    }
    if (asset.targetType === "place" && !latestPlaceByTarget.has(asset.targetId)) {
      latestPlaceByTarget.set(asset.targetId, asset)
    }
  }

  if (input.targetType === "character") {
    const candidates: GenerationReferenceCandidate[] = []
    const own = latestCharacterByTarget.get(input.targetId)
    if (own) {
      candidates.push({
        asset: own,
        label: labelsByEntity.get(input.targetId) || input.targetId,
        role: "identity",
      })
    }
    let styleCount = 0
    for (const asset of selected) {
      if (styleCount >= 2) break
      if (asset.targetId === input.targetId) continue
      candidates.push({
        asset,
        label: labelsByEntity.get(asset.targetId) || asset.targetId,
        role: "style",
      })
      styleCount += 1
    }
    return candidates
  }

  if (input.targetType === "place") {
    const own = latestPlaceByTarget.get(input.targetId)
    if (!own) return []
    const place = records(input.visualPlaces).find((item) =>
      text(item.name) && placeGenerationTargetId(text(item.name)) === input.targetId
    )
    return [{
      asset: own,
      label: text(place?.name) || input.targetId,
      role: "location",
    }]
  }

  const shot = records(input.shots).find((item) =>
    text(item.id) === input.targetId || text(item.entityId) === input.targetId
  )
  if (!shot || !Array.isArray(shot.characters)) return []

  const candidates: GenerationReferenceCandidate[] = []
  const usedTargets = new Set<string>()
  for (const rawName of shot.characters) {
    if (candidates.length >= 3) break
    const name = text(rawName)
    const entityId = entityByName.get(name)
    if (!name || !entityId || usedTargets.has(entityId)) continue
    const asset = latestCharacterByTarget.get(entityId)
    if (!asset) continue
    usedTargets.add(entityId)
    candidates.push({ asset, label: name, role: "identity" })
  }
  if (candidates.length < 3) {
    const placeName = text(shot.place)
    const placeTargetId = placeName ? placeGenerationTargetId(placeName) : ""
    const placeAsset = placeTargetId ? latestPlaceByTarget.get(placeTargetId) : null
    if (placeAsset) {
      candidates.push({ asset: placeAsset, label: placeName, role: "location" })
    }
  }
  return candidates
}

export function withGenerationReferenceInstructions(
  prompt: string,
  candidates: GenerationReferenceCandidate[],
): string {
  if (candidates.length === 0) return prompt
  if (prompt.includes("PROJECT KEYFRAME REFERENCES（")) return prompt.trimEnd()
  const instructions = candidates.map((candidate, index) => {
    if (candidate.role === "location") {
      return `图${index + 1}：「${candidate.label}」已采用场景图，地点参考；保持建筑结构、空间比例、陈设、光线与色调，不要复制人物。`
    }
    if (candidate.role === "identity") {
      return `图${index + 1}：「${candidate.label}」已采用定妆图，身份参考；保持脸型、五官、发型与固定服装特征，不要换人。`
    }
    return `图${index + 1}：「${candidate.label}」仅作整体风格参考；只参考色调、光线、质感与渲染方式，禁止复制该图人物的脸、发型、身体和服装。`
  })
  return `${prompt.trim()}

PROJECT KEYFRAME REFERENCES（附带的 ${candidates.length} 张图按以下顺序）：
${instructions.join("\n")}`
}

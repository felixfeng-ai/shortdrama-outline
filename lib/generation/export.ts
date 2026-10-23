import type { GeneratedAsset } from "./types.ts"

const MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
}

export interface KeyframeManifestEntry {
  id: string
  taskId: string
  targetType: GeneratedAsset["targetType"]
  targetId: string
  mime: string
  bytes: number
  providerId: string
  model: string
  prompt: string
  selectedAt: number | null
  createdAt: number
}

function safePart(value: string): string {
  return value
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80)
}

export function keyframeExportName(asset: GeneratedAsset): string {
  const ext = MIME_EXT[asset.mime] ?? "bin"
  return `${safePart(asset.targetType)}-${safePart(asset.targetId)}-${safePart(asset.id)}.${ext}`
}

export function keyframeManifestEntry(asset: GeneratedAsset): KeyframeManifestEntry {
  return {
    id: asset.id,
    taskId: asset.taskId,
    targetType: asset.targetType,
    targetId: asset.targetId,
    mime: asset.mime,
    bytes: asset.bytes,
    providerId: asset.providerId,
    model: asset.model,
    prompt: asset.prompt,
    selectedAt: asset.selectedAt,
    createdAt: asset.createdAt,
  }
}

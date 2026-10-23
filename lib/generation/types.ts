export type GenerationTargetType = "character" | "shot"
export type GenerationStatus = "queued" | "running" | "succeeded" | "failed" | "canceled"

export interface GenerationTask {
  id: string
  projectId: string
  targetType: GenerationTargetType
  targetId: string
  providerId: string
  model: string
  prompt: string
  promptHash: string
  status: GenerationStatus
  error: string | null
  assetId: string | null
  createdAt: number
  startedAt: number | null
  finishedAt: number | null
}

export interface GeneratedAsset {
  id: string
  taskId: string
  projectId: string
  targetType: GenerationTargetType
  targetId: string
  storageKey: string
  mime: string
  bytes: number
  providerId: string
  model: string
  prompt: string
  selectedAt: number | null
  createdAt: number
  downloadUrl: string
}

export interface GenerationStateDto {
  tasks: GenerationTask[]
  assets: GeneratedAsset[]
}

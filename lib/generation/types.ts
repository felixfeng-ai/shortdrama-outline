export type GenerationTargetType = "character" | "place" | "shot"
export type GenerationStatus = "queued" | "running" | "succeeded" | "failed" | "canceled"
export type MediaKind = "image" | "video" | "audio"

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
  mediaKind?: MediaKind
  batchId?: string | null
  providerTaskId?: string | null
  providerStatus?: string | null
  request?: Record<string, unknown>
  pricingVersion?: string | null
  estimatedCostMicros?: number
  actualCostMicros?: number
  maxAttempts?: number
  attempt?: number
  quotaReservationId?: string | null
  quotaUnits?: number
  retryOfTaskId?: string | null
  idempotencyKey?: string | null
  nextPollAt?: number | null
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
  mediaKind?: MediaKind
  durationMs?: number | null
  width?: number | null
  height?: number | null
  fps?: number | null
  sha256?: string | null
  posterStorageKey?: string | null
  sourceAssetIds?: string[]
  generationMeta?: Record<string, unknown>
  selectedAt: number | null
  createdAt: number
  downloadUrl: string
}

export interface GenerationBatch {
  id: string
  projectId: string
  episode: number
  scope: Record<string, unknown>
  mediaKind: MediaKind
  status: "draft" | "confirmed" | "running" | "completed" | "stopped" | "failed"
  budgetLimitMicros: number
  reservedCostMicros: number
  actualCostMicros: number
  priority: number
  concurrency: number
  pausedAt: number | null
  idempotencyKey: string | null
  createdAt: number
  confirmedAt: number | null
  finishedAt: number | null
}

export interface GenerationStateDto {
  tasks: GenerationTask[]
  assets: GeneratedAsset[]
}

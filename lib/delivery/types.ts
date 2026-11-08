import type {
  DeliveryPlatform,
  DeliverySubtitleMode,
} from "./platforms.ts"

export type DeliveryPackageScope = "episode" | "series"
export type DeliveryPackageStatus = "queued" | "running" | "ready" | "failed"
export type DeliveryReviewStatus =
  | "not_requested"
  | "pending"
  | "approved"
  | "changes_requested"
export type DeliveryItemStatus = "queued" | "running" | "ready" | "failed"
export type PublishRecordStatus = "ready" | "published" | "failed"

export interface DeliveryPackage {
  id: string
  projectId: string
  title: string
  scope: DeliveryPackageScope
  platform: DeliveryPlatform
  subtitleMode: DeliverySubtitleMode
  status: DeliveryPackageStatus
  reviewStatus: DeliveryReviewStatus
  progress: number
  error: string | null
  packageStorageKey: string | null
  manifestStorageKey: string | null
  totalQuotaUnits: number
  createdAt: number
  updatedAt: number
  finishedAt: number | null
}

export interface DeliveryItem {
  id: string
  packageId: string
  episode: number
  renderId: string
  status: DeliveryItemStatus
  error: string | null
  cleanVideoKey: string | null
  publishVideoKey: string | null
  srtKey: string | null
  assKey: string | null
  coverKey: string | null
  metadataJson: string
  createdAt: number
  updatedAt: number
}

export interface DeliveryReviewLink {
  id: string
  packageId: string
  reviewerName: string
  roleLabel: string
  expiresAt: number
  revokedAt: number | null
  createdAt: number
}

export interface DeliveryReviewFeedback {
  id: string
  linkId: string
  packageId: string
  itemId: string
  timestampMs: number
  body: string
  status: "open" | "resolved"
  createdAt: number
}

export interface DeliveryReviewDecision {
  id: string
  packageId: string
  linkId: string
  reviewerName: string
  roleLabel: string
  decision: "approved" | "changes_requested"
  note: string
  createdAt: number
}

export interface PublishRecord {
  id: string
  packageId: string
  itemId: string
  platform: DeliveryPlatform
  status: PublishRecordStatus
  publishedUrl: string
  publishedAt: number | null
  note: string
  createdAt: number
  updatedAt: number
}

export interface PublishMetric {
  id: string
  publishRecordId: string
  capturedAt: number
  views: number
  views3s: number
  completionRate: number
  likes: number
  comments: number
  shares: number
  costUnits: number
}

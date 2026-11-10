import { patchJson, postJson } from "../api.ts"
import type { DeliveryOverview } from "./overview.ts"

export interface DeliveryItemClient {
  id: string
  episode: number
  status: string
  error: string | null
  metadata: Record<string, unknown>
  cleanVideoUrl: string
  publishVideoUrl: string
  srtUrl: string
  assUrl: string
  coverUrl: string
  metadataUrl: string
}

export interface DeliveryPackageClient {
  id: string
  projectId: string
  title: string
  scope: "episode" | "series"
  platform: string
  subtitleMode: "sidecar" | "burned" | "both"
  status: "queued" | "running" | "ready" | "failed"
  reviewStatus: string
  progress: number
  error: string | null
  totalQuotaUnits: number
  packageUrl: string | null
  manifestUrl: string | null
  items: DeliveryItemClient[]
  platformProfile: Record<string, unknown>
  reviewLinks: Array<Record<string, unknown>>
  publishRecords: Array<Record<string, unknown>>
  publishSummary: Record<string, number>
  createdAt: number
  updatedAt: number
}

export interface DeliveryReviewClient {
  package: Record<string, unknown>
  reviewer: {
    name: string
    roleLabel: string
    expiresAt: number
  }
  items: Array<{
    id: string
    episode: number
    episodeCode: string
    metadata: Record<string, unknown>
    publishVideoUrl: string
    cleanVideoUrl: string
    srtUrl: string
    coverUrl: string
  }>
  feedback: Array<Record<string, unknown>>
  decisions: Array<Record<string, unknown>>
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" })
  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload?.success || payload.data === null) {
    throw new Error(payload?.error || "请求失败")
  }
  return payload.data as T
}

export async function fetchDeliveryPackages(projectId: string): Promise<DeliveryPackageClient[]> {
  const query = new URLSearchParams({ projectId })
  const data = await getJson<{ packages: DeliveryPackageClient[] }>(
    `/api/video/delivery-packages?${query.toString()}`,
  )
  return data.packages
}

export async function fetchDeliveryOverview(): Promise<DeliveryOverview> {
  const data = await getJson<{ overview: DeliveryOverview }>(
    "/api/video/delivery-overview",
  )
  return data.overview
}

export async function createDeliveryPackage(input: {
  projectId: string
  title: string
  scope: "episode" | "series"
  platform: string
  subtitleMode: "sidecar" | "burned" | "both"
  items: Array<{ episode: number; renderId: string }>
  idempotencyKey?: string
}): Promise<DeliveryPackageClient> {
  const data = await postJson<{ package: DeliveryPackageClient }>(
    "/api/video/delivery-packages",
    input,
  )
  return data.package
}

export async function createDeliveryReviewLink(input: {
  projectId: string
  packageId: string
  reviewerName: string
  roleLabel: string
}): Promise<{ reviewUrl: string; token: string }> {
  return postJson(
    `/api/video/delivery-packages/${encodeURIComponent(input.packageId)}/review-links`,
    input,
  )
}

export async function createPublishRecord(input: {
  projectId: string
  packageId: string
  itemId: string
  platform: string
  status: "ready" | "published" | "failed"
  publishedUrl?: string
  note?: string
}): Promise<Record<string, unknown>> {
  const data = await postJson<{ record: Record<string, unknown> }>(
    `/api/video/delivery-packages/${encodeURIComponent(input.packageId)}/publish-records`,
    input,
  )
  return data.record
}

export async function updatePublishRecord(input: {
  projectId: string
  packageId: string
  recordId: string
  status?: "ready" | "published" | "failed"
  publishedUrl?: string
  note?: string
}): Promise<Record<string, unknown>> {
  const data = await patchJson<{ record: Record<string, unknown> }>(
    `/api/video/publish-records/${encodeURIComponent(input.recordId)}`,
    input,
  )
  return data.record
}

export async function addPublishMetric(input: {
  projectId: string
  packageId: string
  recordId: string
  views: number
  views3s: number
  completionRate: number
  likes: number
  comments: number
  shares: number
  costUnits: number
}): Promise<void> {
  await postJson(
    `/api/video/publish-records/${encodeURIComponent(input.recordId)}/metrics`,
    input,
  )
}

export function fetchDeliveryReview(token: string): Promise<DeliveryReviewClient> {
  return getJson(`/api/reviews/${encodeURIComponent(token)}`)
}

export async function submitReviewFeedback(input: {
  token: string
  itemId: string
  timestampMs: number
  body: string
}): Promise<void> {
  await postJson(`/api/reviews/${encodeURIComponent(input.token)}/feedback`, input)
}

export async function submitReviewDecision(input: {
  token: string
  decision: "approved" | "changes_requested"
  note: string
}): Promise<void> {
  await postJson(`/api/reviews/${encodeURIComponent(input.token)}/decision`, input)
}

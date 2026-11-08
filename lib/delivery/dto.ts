import type { DatabaseSync } from "node:sqlite"

import { deliveryPlatformProfile } from "./platforms.ts"
import {
  getDeliveryPackageById,
  listDeliveryItems,
} from "./repo.ts"
import { listDeliveryReviewLinks } from "./review.ts"
import {
  getPublishSummary,
  listLatestPublishMetrics,
  listPublishRecords,
} from "./publish.ts"
import type {
  DeliveryItem,
  DeliveryPackage,
  PublishMetric,
  PublishRecord,
} from "./types.ts"

export function episodeFileCode(episode: number): string {
  return `S01E${String(Math.max(1, episode)).padStart(2, "0")}`
}

export function deliveryPackageDto(
  db: DatabaseSync,
  pkg: DeliveryPackage,
  options: { includePublish?: boolean } = {},
): Record<string, unknown> {
  const base = `/api/video/delivery-packages/${encodeURIComponent(pkg.id)}`
  const query = new URLSearchParams({ projectId: pkg.projectId })
  const items = listDeliveryItems(db, pkg.id).map((item) => ({
    ...item,
    metadata: safeJson(item.metadataJson),
    cleanVideoUrl: `${base}/file?${query.toString()}&kind=clean&itemId=${encodeURIComponent(item.id)}`,
    publishVideoUrl: `${base}/file?${query.toString()}&kind=publish&itemId=${encodeURIComponent(item.id)}`,
    srtUrl: `${base}/file?${query.toString()}&kind=srt&itemId=${encodeURIComponent(item.id)}`,
    assUrl: `${base}/file?${query.toString()}&kind=ass&itemId=${encodeURIComponent(item.id)}`,
    coverUrl: `${base}/file?${query.toString()}&kind=cover&itemId=${encodeURIComponent(item.id)}`,
    metadataUrl: `${base}/file?${query.toString()}&kind=metadata&itemId=${encodeURIComponent(item.id)}`,
  }))
  const reviewLinks = listDeliveryReviewLinks(db, pkg.id).map((link) => ({
    ...link,
    reviewUrl: null,
  }))
  const publishRecords = options.includePublish ? listPublishRecords(db, pkg.id) : []
  const publishMetrics = options.includePublish ? listLatestPublishMetrics(db, pkg.id) : []
  const publishSummary = getPublishSummary(db, pkg.id)
  return {
    ...pkg,
    platformProfile: deliveryPlatformProfile(pkg.platform),
    packageUrl: pkg.status === "ready"
      ? `${base}/file?${query.toString()}&kind=package`
      : null,
    manifestUrl: pkg.status === "ready"
      ? `${base}/file?${query.toString()}&kind=manifest`
      : null,
    items,
    reviewLinks,
    publishRecords: publishRecords.map((record) => ({
      ...record,
      metrics: publishMetrics.filter((metric) => metric.publishRecordId === record.id),
    })),
    publishSummary,
  }
}

function safeJson(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
  } catch {
    return {}
  }
}

export function deliveryItemDto(item: DeliveryItem): Record<string, unknown> {
  return {
    ...item,
    metadata: safeJson(item.metadataJson),
  }
}

export function publishMetricDto(metric: PublishMetric): PublishMetric {
  return metric
}

export function publishRecordWithMetrics(
  record: PublishRecord,
  metrics: PublishMetric[],
): Record<string, unknown> {
  return {
    ...record,
    metrics: metrics.filter((metric) => metric.publishRecordId === record.id),
  }
}

import type { DatabaseSync } from "node:sqlite"

import { getPublishSummary } from "./publish.ts"
import { listDeliveryPackages } from "./repo.ts"

export interface ProjectDeliverySummary {
  totalPackages: number
  readyPackages: number
  approvedEpisodes: number
  publishedEpisodes: number
  totalViews: number
  weightedRetention3s: number
  completionRate: number
  totalCostUnits: number
  costPerThousandViews: number
}

export function getProjectDeliverySummary(
  db: DatabaseSync,
  projectId: string,
): ProjectDeliverySummary {
  const packages = listDeliveryPackages(db, projectId)
  const approved = db.prepare(
    `SELECT COUNT(DISTINCT items.episode) AS n
     FROM video_delivery_items items
     JOIN video_delivery_packages packages ON packages.id = items.package_id
     WHERE packages.project_id = ? AND packages.review_status = 'approved'`,
  ).get(projectId) as { n: number }
  const published = db.prepare(
    `SELECT COUNT(DISTINCT items.episode) AS n
     FROM video_publish_records records
     JOIN video_delivery_items items ON items.id = records.item_id
     JOIN video_delivery_packages packages ON packages.id = records.package_id
     WHERE packages.project_id = ? AND records.status = 'published'`,
  ).get(projectId) as { n: number }
  const summaries = packages.map((pkg) => getPublishSummary(db, pkg.id))
  const totalViews = summaries.reduce((sum, item) => sum + item.totalViews, 0)
  const totalCostUnits = summaries.reduce((sum, item) => sum + item.totalCostUnits, 0)
  const views3s = summaries.reduce(
    (sum, item) => sum + item.weightedRetention3s * item.totalViews,
    0,
  )
  const completion = summaries.reduce(
    (sum, item) => sum + item.completionRate * item.totalViews,
    0,
  )
  return {
    totalPackages: packages.length,
    readyPackages: packages.filter((pkg) => pkg.status === "ready").length,
    approvedEpisodes: Number(approved.n),
    publishedEpisodes: Number(published.n),
    totalViews,
    weightedRetention3s: totalViews > 0 ? views3s / totalViews : 0,
    completionRate: totalViews > 0 ? completion / totalViews : 0,
    totalCostUnits,
    costPerThousandViews: totalViews > 0 ? totalCostUnits / (totalViews / 1_000) : 0,
  }
}

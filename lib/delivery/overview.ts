import type { DatabaseSync } from "node:sqlite"

import { listProjects } from "../assets/repo.ts"
import { deliveryPlatformProfile } from "./platforms.ts"
import type { DeliveryPlatform, DeliverySubtitleMode } from "./platforms.ts"
import { getProjectDeliverySummary, type ProjectDeliverySummary } from "./ledger.ts"
import { listDeliveryItems, listDeliveryPackages } from "./repo.ts"
import type {
  DeliveryPackageScope,
  DeliveryPackageStatus,
  DeliveryReviewStatus,
} from "./types.ts"

export interface DeliveryOverviewPackage {
  id: string
  title: string
  scope: DeliveryPackageScope
  platform: DeliveryPlatform
  platformLabel: string
  subtitleMode: DeliverySubtitleMode
  status: DeliveryPackageStatus
  reviewStatus: DeliveryReviewStatus
  progress: number
  episodeCount: number
  createdAt: number
  updatedAt: number
}

export interface DeliveryOverviewProject {
  project: {
    id: string
    title: string
    updatedAt: number
  }
  summary: ProjectDeliverySummary
  statusCounts: Record<DeliveryPackageStatus, number>
  latestPackages: DeliveryOverviewPackage[]
}

export interface DeliveryOverview {
  projects: DeliveryOverviewProject[]
  totals: {
    projects: number
    projectsWithDelivery: number
    totalPackages: number
    queuedPackages: number
    runningPackages: number
    readyPackages: number
    failedPackages: number
    publishedEpisodes: number
    totalViews: number
  }
}

function emptyStatusCounts(): Record<DeliveryPackageStatus, number> {
  return {
    queued: 0,
    running: 0,
    ready: 0,
    failed: 0,
  }
}

export function getDeliveryOverview(
  db: DatabaseSync,
  ownerId: string,
): DeliveryOverview {
  const projects = listProjects(db, ownerId)
  const totals = {
    projects: projects.length,
    projectsWithDelivery: 0,
    totalPackages: 0,
    queuedPackages: 0,
    runningPackages: 0,
    readyPackages: 0,
    failedPackages: 0,
    publishedEpisodes: 0,
    totalViews: 0,
  }

  const projectRows = projects.map((project): DeliveryOverviewProject => {
    const packages = listDeliveryPackages(db, project.id)
    const statusCounts = emptyStatusCounts()
    for (const pkg of packages) statusCounts[pkg.status] += 1
    const summary = getProjectDeliverySummary(db, project.id)
    if (packages.length > 0) totals.projectsWithDelivery += 1
    totals.totalPackages += packages.length
    totals.queuedPackages += statusCounts.queued
    totals.runningPackages += statusCounts.running
    totals.readyPackages += statusCounts.ready
    totals.failedPackages += statusCounts.failed
    totals.publishedEpisodes += summary.publishedEpisodes
    totals.totalViews += summary.totalViews

    return {
      project: {
        id: project.id,
        title: project.title,
        updatedAt: project.updatedAt,
      },
      summary,
      statusCounts,
      latestPackages: packages.slice(0, 4).map((pkg) => ({
        id: pkg.id,
        title: pkg.title,
        scope: pkg.scope,
        platform: pkg.platform,
        platformLabel: String(deliveryPlatformProfile(pkg.platform).label ?? pkg.platform),
        subtitleMode: pkg.subtitleMode,
        status: pkg.status,
        reviewStatus: pkg.reviewStatus,
        progress: pkg.progress,
        episodeCount: listDeliveryItems(db, pkg.id).length,
        createdAt: pkg.createdAt,
        updatedAt: pkg.updatedAt,
      })),
    }
  })

  return { projects: projectRows, totals }
}

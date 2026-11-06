import { NextResponse } from 'next/server'

import { InputError, errorResponse, ok } from '@/lib/api'
import { ARTIFACT_KINDS } from '@/lib/assets/types'
import { getDbForRequest } from '@/lib/assets/store'
import { latestSnapshot, listProjects } from '@/lib/assets/repo'
import { resolveProjectOwner, resolveRequestIdentity } from '@/lib/auth/request'
import { buildMobileContext } from '@/lib/mobile-context'
import { getQuota } from '@/lib/quota'
import { projectQuotaEstimates, readEpisodeCount } from '@/lib/episodes'
import { QUOTA_PRICING_VERSION } from '@/lib/model-pricing'
import { getProjectContext } from '@/lib/assets/project-context'
import {
  listGeneratedAssets,
  listGenerationBatches,
  listGenerationTasks,
  reconcileStaleGenerationTasks,
} from '@/lib/generation/repo'
import { getPublicVideoCapabilities } from '@/lib/video/model'
import { reconcileProjectVideoTasks } from '@/lib/video/reconcile'
import {
  listProjectDecisions,
  listProjectJudgments,
} from '@/lib/assets/decisions'
import { listEntityComments } from '@/lib/entity-comments'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const db = getDbForRequest()
    const ownerId = resolveProjectOwner(db, req)
    const projects = listProjects(db, ownerId)
    const requestedId = new URL(req.url).searchParams.get('projectId')?.trim() || ''
    const active = requestedId
      ? projects.find((project) => project.id === requestedId)
      : projects[0]
    if (requestedId && !active) throw new InputError('项目不存在或无权访问')
    const snapshots = active
      ? Object.fromEntries(
          ARTIFACT_KINDS.map((kind) => [
            kind,
            latestSnapshot(db, active.id, kind)?.payload ?? null,
          ]),
        )
      : {}
    if (active) {
      reconcileStaleGenerationTasks(db, active.id)
      // 工作区刷新不能被视频供应商的长轮询拖住；对账仍在后台继续。
      await Promise.race([
        reconcileProjectVideoTasks(db, active.id, ownerId),
        new Promise<void>((resolve) => setTimeout(resolve, 1_500)),
      ])
    }
    const quota = getQuota(db, resolveRequestIdentity(db, req))
    const projectContext = active ? getProjectContext(db, active.id) : null
    const episodeCount = readEpisodeCount(projectContext?.episodeCount)
    const estimates = projectQuotaEstimates(quota.remaining, episodeCount)
    const estimate = estimates.selected

    return NextResponse.json(
      ok(
        buildMobileContext({
          projects,
          snapshots,
          quota: {
            remaining: quota.remaining,
            limit: quota.limit,
            used: quota.used,
            projectsLeft: estimate.projectsLeft,
            episodeCount: estimate.episodeCount,
            projectCost: estimate.units,
            pricingVersion: QUOTA_PRICING_VERSION,
            estimates,
          },
          now: Date.now(),
          activeProjectId: active?.id,
          tasks: active ? listGenerationTasks(db, active.id) : [],
          assets: active ? listGeneratedAssets(db, active.id) : [],
          batches: active ? listGenerationBatches(db, active.id) : [],
          videoCapabilities: getPublicVideoCapabilities(),
          decisions: active ? listProjectDecisions(db, active.id, 20) : [],
          judgments: active ? listProjectJudgments(db, active.id, 20) : [],
          comments: active ? listEntityComments(db, active.id) : [],
        }),
      ),
    )
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

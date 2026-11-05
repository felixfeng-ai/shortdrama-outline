import { NextResponse } from 'next/server'

import { InputError, errorResponse, ok } from '@/lib/api'
import { ARTIFACT_KINDS } from '@/lib/assets/types'
import { getDbForRequest } from '@/lib/assets/store'
import { latestSnapshot, listProjects } from '@/lib/assets/repo'
import { resolveProjectOwner, resolveRequestIdentity } from '@/lib/auth/request'
import { buildMobileContext } from '@/lib/mobile-context'
import { FULL_PROJECT_COST, getQuota } from '@/lib/quota'
import {
  listGeneratedAssets,
  listGenerationBatches,
  listGenerationTasks,
  reconcileStaleGenerationTasks,
} from '@/lib/generation/repo'
import { getPublicVideoCapabilities } from '@/lib/video/model'
import { reconcileProjectVideoTasks } from '@/lib/video/reconcile'

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

    return NextResponse.json(
      ok(
        buildMobileContext({
          projects,
          snapshots,
          quota: {
            remaining: quota.remaining,
            limit: quota.limit,
            used: quota.used,
            projectsLeft: Math.floor(quota.remaining / FULL_PROJECT_COST),
          },
          now: Date.now(),
          activeProjectId: active?.id,
          tasks: active ? listGenerationTasks(db, active.id) : [],
          assets: active ? listGeneratedAssets(db, active.id) : [],
          batches: active ? listGenerationBatches(db, active.id) : [],
          videoCapabilities: getPublicVideoCapabilities(),
        }),
      ),
    )
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

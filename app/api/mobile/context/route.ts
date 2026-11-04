import { NextResponse } from 'next/server'

import { ok, errorResponse } from '@/lib/api'
import { listProjects, latestSnapshot } from '@/lib/assets/repo'
import { ARTIFACT_KINDS } from '@/lib/assets/types'
import { getDbForRequest } from '@/lib/assets/store'
import { buildMobileContext } from '@/lib/mobile-context'
import { FULL_PROJECT_COST, getQuota, identityFromRequest } from '@/lib/quota'
import { ownerFromRequest } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const db = getDbForRequest()
    const ownerId = ownerFromRequest(req)
    const projects = listProjects(db, ownerId)
    const active = projects[0]
    const snapshots = active
      ? Object.fromEntries(
          ARTIFACT_KINDS.map((kind) => [kind, latestSnapshot(db, active.id, kind)?.payload ?? null]),
        )
      : {}
    const quota = getQuota(db, identityFromRequest(req))

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
        }),
      ),
    )
  } catch (error) {
    const { body, status } = errorResponse(error)
    return NextResponse.json(body, { status })
  }
}

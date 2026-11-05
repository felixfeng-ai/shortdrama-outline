import { NextResponse } from 'next/server'

import { InputError, errorResponse, ok } from '@/lib/api'
import { assertProjectAccess } from '@/lib/assets/access'
import { getProjectCanon } from '@/lib/assets/canon'
import { latestSnapshot } from '@/lib/assets/repo'
import { getDbForRequest } from '@/lib/assets/store'
import { resolveProjectOwner, resolveRequestIdentity } from '@/lib/auth/request'
import { buildContinuityContext } from '@/lib/continuity/context'
import { compareContinuityPhoto } from '@/lib/continuity/vision'
import { chargeQuota } from '@/lib/quota'
import { enforceApiRateLimit } from '@/lib/security/api-rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

function requiredString(value: unknown, message: string): string {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text) throw new InputError(message)
  return text
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)
    const db = getDbForRequest()
    const ownerId = resolveProjectOwner(db, req)
    const projectId = requiredString(body?.projectId, '缺少项目 id')
    const targetId = requiredString(body?.targetId, '缺少当前镜头 id')
    const imageBase64 = requiredString(body?.imageBase64, '缺少现场照片')
    const mime = (typeof body?.mime === 'string' ? body.mime.trim() : '') || 'image/jpeg'
    assertProjectAccess(db, projectId, ownerId)

    const project = db.prepare(
      'SELECT title FROM projects WHERE id = ? AND owner_id = ?',
    ).get(projectId, ownerId) as { title: string } | undefined
    if (!project) throw new InputError('项目不存在或无权访问')

    const snapshots = {
      visualCharacters: latestSnapshot(db, projectId, 'visualCharacters')?.payload ?? null,
      visualPlaces: latestSnapshot(db, projectId, 'visualPlaces')?.payload ?? null,
      shots: latestSnapshot(db, projectId, 'shots')?.payload ?? null,
    }
    const canon = getProjectCanon(db, projectId)
    const context = buildContinuityContext({
      projectTitle: project.title,
      targetId,
      snapshots,
      canon: canon.facts,
    })

    const identity = resolveRequestIdentity(db, req)
    enforceApiRateLimit(db, req, 'model', { identity })
    chargeQuota(db, identity, 'visual')
    const report = await compareContinuityPhoto({
      imageBase64,
      mime,
      context,
    })
    return NextResponse.json(ok({
      report,
      context: {
        shotLabel: context.shotLabel,
        characterCount: context.characters.length,
        placeCount: context.places.length,
        canonCount: context.canon.length,
      },
    }))
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

import { NextResponse } from 'next/server'

import { InputError, errorResponse, ok } from '@/lib/api'
import { assertProjectAccess } from '@/lib/assets/access'
import { getDbForRequest } from '@/lib/assets/store'
import { resolveProjectOwner } from '@/lib/auth/request'
import { applyMobileShotEdit, readMobileShotEdit } from '@/lib/mobile-agent-apply'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)
    const projectId = typeof body?.projectId === 'string' ? body.projectId.trim() : ''
    const baseSnapshotId =
      typeof body?.baseSnapshotId === 'string' ? body.baseSnapshotId.trim() : ''
    if (!projectId) throw new InputError('缺少 projectId')
    if (!baseSnapshotId) throw new InputError('缺少建议所基于的分镜版本')

    const db = getDbForRequest()
    assertProjectAccess(db, projectId, resolveProjectOwner(db, req))
    const edit = readMobileShotEdit(body?.edit)
    const result = applyMobileShotEdit(db, { projectId, baseSnapshotId, edit })

    return NextResponse.json(
      ok({
        snapshotId: result.snapshot.id,
        version: result.snapshot.version,
        shot: result.shot.shot,
        target: edit.target,
      }),
    )
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

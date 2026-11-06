import { NextResponse } from "next/server"

import { errorResponse, ok } from "@/lib/api"
import { assertProjectAccess } from "@/lib/assets/access"
import { getDbForRequest } from "@/lib/assets/store"
import { resolveProjectOwner } from "@/lib/auth/request"
import { assertNovelAccess } from "@/lib/novels/access"
import {
  getNovelRun,
  listNovelChapters,
  listNovelVolumes,
  markNovelChaptersStale,
} from "@/lib/novels/repo"
import { buildNovelSourcePack } from "@/lib/novels/source-pack"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteContext = {
  params: { id: string; novelId: string } | Promise<{ id: string; novelId: string }>
}

export async function GET(req: Request, context: RouteContext) {
  try {
    const db = getDbForRequest()
    const ownerId = resolveProjectOwner(db, req)
    const { id, novelId } = await context.params
    assertProjectAccess(db, id, ownerId)
    let edition = assertNovelAccess(db, id, novelId, ownerId)
    const source = buildNovelSourcePack(db, id)
    if (edition.sourceSignature && edition.sourceSignature !== source.signature) {
      markNovelChaptersStale(db, novelId, source.signature)
      edition = assertNovelAccess(db, id, novelId, ownerId)
    }
    return NextResponse.json(ok({
      edition,
      volumes: listNovelVolumes(db, novelId),
      chapters: listNovelChapters(db, novelId),
      run: edition.currentRunId ? getNovelRun(db, edition.currentRunId) : null,
      upstream: {
        signature: source.signature,
        snapshotIds: source.sourceSnapshotIds,
        episodeCount: source.episodes.length,
      },
    }), { headers: { "cache-control": "no-store" } })
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

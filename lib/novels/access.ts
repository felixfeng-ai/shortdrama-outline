import type { DatabaseSync } from "node:sqlite"

import { getNovelEditionForProject } from "./repo.ts"
import type { NovelEditionRecord } from "./types.ts"

export function assertNovelAccess(
  db: DatabaseSync,
  projectId: string,
  novelId: string,
  ownerId: string,
): NovelEditionRecord {
  const edition = getNovelEditionForProject(db, novelId, projectId, ownerId)
  if (edition) return edition
  const error = new Error("小说稿不存在或无权访问") as Error & { status: number }
  error.status = 404
  throw error
}

import type { DatabaseSync } from "node:sqlite"

import { InputError } from "../api.ts"
import { readBrief, type CreativeBrief } from "../brief.ts"
import { clampEpisodeCount } from "../episodes.ts"
import { readLook, type LookBook } from "../look.ts"

export interface ProjectContext {
  projectId: string
  brief: CreativeBrief
  look: LookBook
  episodeCount: number
  version: number
  updatedBy: string | null
  updatedAt: number
}

export interface ProjectContextInput {
  brief?: unknown
  look?: unknown
  episodeCount?: unknown
  version?: unknown
}

interface ProjectContextRow {
  project_id: string
  brief_json: string
  look_json: string
  episode_count: number
  version: number
  updated_by: string | null
  updated_at: number
}

export class ProjectContextConflictError extends Error {
  status = 409

  constructor() {
    super("项目设置已在其他设备更新，请刷新后重试")
    this.name = "ProjectContextConflictError"
  }
}

function rowToContext(row: ProjectContextRow): ProjectContext {
  let brief: unknown = null
  let look: unknown = null
  try {
    brief = JSON.parse(row.brief_json)
  } catch {
    brief = null
  }
  try {
    look = JSON.parse(row.look_json)
  } catch {
    look = null
  }
  return {
    projectId: row.project_id,
    brief: readBrief(brief),
    look: readLook(look),
    episodeCount: clampEpisodeCount(Number(row.episode_count)),
    version: Number(row.version),
    updatedBy: row.updated_by,
    updatedAt: Number(row.updated_at),
  }
}

export function getProjectContext(
  db: DatabaseSync,
  projectId: string,
): ProjectContext | null {
  const row = db.prepare(
    "SELECT * FROM project_context WHERE project_id = ?",
  ).get(projectId) as ProjectContextRow | undefined
  return row ? rowToContext(row) : null
}

export function saveProjectContext(
  db: DatabaseSync,
  projectId: string,
  ownerId: string,
  input: ProjectContextInput,
  now = Date.now(),
): ProjectContext {
  const brief = readBrief(input.brief)
  const look = readLook(input.look)
  const episodeCount = clampEpisodeCount(Number(input.episodeCount))
  const rawVersion = input.version
  if (
    rawVersion !== undefined
    && (!Number.isSafeInteger(Number(rawVersion)) || Number(rawVersion) < 0)
  ) {
    throw new InputError("项目设置版本不正确")
  }
  const expectedVersion = rawVersion === undefined ? null : Number(rawVersion)
  const existing = getProjectContext(db, projectId)
  if (expectedVersion !== null && existing?.version !== expectedVersion) {
    throw new ProjectContextConflictError()
  }

  if (!existing) {
    db.prepare(
      `INSERT INTO project_context
        (project_id, brief_json, look_json, episode_count, version, updated_by, updated_at)
       VALUES (?, ?, ?, ?, 1, ?, ?)`,
    ).run(
      projectId,
      JSON.stringify(brief),
      JSON.stringify(look),
      episodeCount,
      ownerId,
      now,
    )
  } else {
    const result = expectedVersion === null
      ? db.prepare(
        `UPDATE project_context
         SET brief_json = ?, look_json = ?, episode_count = ?, version = version + 1,
             updated_by = ?, updated_at = ?
         WHERE project_id = ?`,
      ).run(
        JSON.stringify(brief),
        JSON.stringify(look),
        episodeCount,
        ownerId,
        now,
        projectId,
      )
      : db.prepare(
        `UPDATE project_context
         SET brief_json = ?, look_json = ?, episode_count = ?, version = version + 1,
             updated_by = ?, updated_at = ?
         WHERE project_id = ? AND version = ?`,
      ).run(
        JSON.stringify(brief),
        JSON.stringify(look),
        episodeCount,
        ownerId,
        now,
        projectId,
        expectedVersion,
      )
    if (Number(result.changes) !== 1) throw new ProjectContextConflictError()
  }
  return getProjectContext(db, projectId)!
}

import type { DatabaseSync } from "node:sqlite"
import { createHash, randomBytes, randomUUID } from "node:crypto"

import { getProject, listSnapshots } from "./repo.ts"
import type { ArtifactKind } from "./types.ts"

export interface ProjectShareResult {
  id: string
  token: string
  expiresAt: number
}

export class ProjectShareError extends Error {
  status: number
  constructor(message: string, status = 404) {
    super(message)
    this.name = "ProjectShareError"
    this.status = status
  }
}

interface ProjectShareRow {
  id: string
  projectId: string
  ownerId: string
  expiresAt: number
}

export interface ProjectShareReview {
  title: string
  updatedAt: number
  expiresAt: number
  idea: { idea: string; genre: string } | null
  characters: unknown[]
  acts: unknown[]
  episodes: unknown[]
  visuals: unknown[]
  scenes: unknown[]
  places: unknown[]
  shots: unknown[]
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

function latestPayload(
  db: DatabaseSync,
  projectId: string,
  kind: ArtifactKind,
): unknown {
  return listSnapshots(db, projectId, kind)[0]?.payload ?? null
}

export function createProjectShare(
  db: DatabaseSync,
  projectId: string,
  ownerId: string,
  options: { now?: number; ttlDays?: number } = {},
): ProjectShareResult {
  const project = getProject(db, projectId, ownerId)
  if (!project) throw new ProjectShareError("项目不存在或无权访问")
  const now = options.now ?? Date.now()
  const days = Math.max(1, Math.min(30, Math.floor(options.ttlDays ?? 7)))
  const token = randomBytes(32).toString("base64url")
  const id = randomUUID()
  const expiresAt = now + days * 24 * 60 * 60_000

  db.exec("BEGIN IMMEDIATE")
  try {
    db.prepare(
      "UPDATE project_shares SET revoked_at = ? WHERE project_id = ? AND owner_id = ? AND revoked_at IS NULL",
    ).run(now, projectId, ownerId)
    db.prepare(
      `INSERT INTO project_shares
        (id, project_id, owner_id, token_hash, created_at, expires_at, last_viewed_at, revoked_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, NULL)`,
    ).run(id, projectId, ownerId, tokenHash(token), now, expiresAt)
    db.exec("COMMIT")
  } catch (error) {
    db.exec("ROLLBACK")
    throw error
  }
  return { id, token, expiresAt }
}

export function resolveProjectShare(
  db: DatabaseSync,
  token: string,
  now = Date.now(),
): ProjectShareRow | null {
  const value = token.trim()
  if (value.length < 32 || value.length > 128) return null
  const row = db.prepare(
    `SELECT id, project_id, owner_id, expires_at
     FROM project_shares
     WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ?`,
  ).get(tokenHash(value), now) as {
    id: string
    project_id: string
    owner_id: string
    expires_at: number
  } | undefined
  if (!row) return null
  db.prepare("UPDATE project_shares SET last_viewed_at = ? WHERE id = ?").run(now, row.id)
  return {
    id: row.id,
    projectId: row.project_id,
    ownerId: row.owner_id,
    expiresAt: Number(row.expires_at),
  }
}

export function loadProjectShare(
  db: DatabaseSync,
  token: string,
  now = Date.now(),
): ProjectShareReview | null {
  const share = resolveProjectShare(db, token, now)
  if (!share) return null
  const project = getProject(db, share.projectId, share.ownerId)
  if (!project) return null
  const ideaPayload = latestPayload(db, project.id, "idea") as { idea?: unknown; genre?: unknown } | null
  return {
    title: project.title,
    updatedAt: project.updatedAt,
    expiresAt: share.expiresAt,
    idea: ideaPayload
      ? {
        idea: typeof ideaPayload.idea === "string" ? ideaPayload.idea : "",
        genre: typeof ideaPayload.genre === "string" ? ideaPayload.genre : "",
      }
      : null,
    characters: (latestPayload(db, project.id, "characters") as unknown[]) ?? [],
    acts: (latestPayload(db, project.id, "acts") as unknown[]) ?? [],
    episodes: (latestPayload(db, project.id, "episodes") as unknown[]) ?? [],
    visuals: (latestPayload(db, project.id, "visualCharacters") as unknown[]) ?? [],
    scenes: (latestPayload(db, project.id, "scenes") as unknown[]) ?? [],
    places: (latestPayload(db, project.id, "visualPlaces") as unknown[]) ?? [],
    shots: (latestPayload(db, project.id, "shots") as unknown[]) ?? [],
  }
}

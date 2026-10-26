import type { DatabaseSync } from "node:sqlite"
import { createHash } from "node:crypto"

export type TextGenerationKind = "episodes" | "shots"

export interface TextGenerationCheckpoint<T = unknown> {
  projectId: string
  kind: TextGenerationKind
  signature: string
  cursor: number
  state: T
  updatedAt: number
}

export function checkpointSignature(kind: TextGenerationKind, value: unknown): string {
  return createHash("sha256")
    .update(`${kind}:${JSON.stringify(stableValue(value))}`)
    .digest("hex")
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (!value || typeof value !== "object") return value
  const record = value as Record<string, unknown>
  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .filter((key) => record[key] !== undefined)
      .map((key) => [key, stableValue(record[key])]),
  )
}

interface CheckpointRow {
  project_id: string
  kind: string
  signature: string
  cursor: number
  state: string
  updated_at: number
}

export function saveTextGenerationCheckpoint<T>(
  db: DatabaseSync,
  input: Omit<TextGenerationCheckpoint<T>, "updatedAt">,
): TextGenerationCheckpoint<T> {
  const now = Date.now()
  db.prepare(
    `INSERT INTO text_generation_checkpoints
      (project_id, kind, signature, cursor, state, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(project_id, kind) DO UPDATE SET
       signature = excluded.signature,
       cursor = excluded.cursor,
       state = excluded.state,
       updated_at = excluded.updated_at`,
  ).run(
    input.projectId,
    input.kind,
    input.signature,
    Math.max(0, Math.floor(input.cursor)),
    JSON.stringify(input.state),
    now,
  )
  return { ...input, updatedAt: now }
}

export function loadTextGenerationCheckpoint<T>(
  db: DatabaseSync,
  projectId: string,
  kind: TextGenerationKind,
  signature: string,
): TextGenerationCheckpoint<T> | null {
  const row = db.prepare(
    `SELECT * FROM text_generation_checkpoints
     WHERE project_id = ? AND kind = ? AND signature = ?`,
  ).get(projectId, kind, signature) as CheckpointRow | undefined
  if (!row) return null
  try {
    return {
      projectId: row.project_id,
      kind: row.kind as TextGenerationKind,
      signature: row.signature,
      cursor: row.cursor,
      state: JSON.parse(row.state) as T,
      updatedAt: row.updated_at,
    }
  } catch {
    return null
  }
}

export function clearTextGenerationCheckpoint(
  db: DatabaseSync,
  projectId: string,
  kind: TextGenerationKind,
): boolean {
  const result = db.prepare(
    "DELETE FROM text_generation_checkpoints WHERE project_id = ? AND kind = ?",
  ).run(projectId, kind)
  return Number(result.changes) > 0
}

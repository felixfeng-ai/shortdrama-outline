import type { DatabaseSync } from "node:sqlite"

export function effectiveQuotaExtraUnits(
  db: DatabaseSync,
  userId: string,
  now = Date.now(),
): number {
  const row = db.prepare(
    `SELECT extra_units, expires_at
     FROM user_quota_overrides
     WHERE user_id = ?`,
  ).get(userId) as { extra_units: number; expires_at: number } | undefined
  if (!row) return 0
  return Number(row.expires_at) > now
    ? Math.max(0, Math.floor(Number(row.extra_units) || 0))
    : 0
}

import { randomUUID } from "node:crypto"
import type { DatabaseSync } from "node:sqlite"

import { InputError } from "../api.ts"
import { getQuota } from "../quota.ts"
import { effectiveQuotaExtraUnits } from "./quota-overrides.ts"

export interface AdminQuotaOverride {
  extraUnits: number
  expiresAt: number
  reason: string
  updatedAt: number
}

export interface AdminUserRow {
  id: string
  email: string | null
  username: string
  createdAt: number
  lastSeenAt: number | null
  projectCount: number
  quota: {
    used: number
    limit: number
    remaining: number
    extraUnits: number
    expiresAt: number | null
    reason: string
  }
}

function userExists(db: DatabaseSync, userId: string): boolean {
  return Boolean(db.prepare("SELECT 1 AS ok FROM users WHERE id = ?").get(userId))
}

function audit(
  db: DatabaseSync,
  adminUserId: string,
  action: string,
  targetUserId: string,
  detail: Record<string, unknown>,
  now: number,
): void {
  db.prepare(
    `INSERT INTO admin_audit_log
      (id, admin_user_id, action, target_user_id, detail_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(),
    adminUserId,
    action,
    targetUserId,
    JSON.stringify(detail),
    now,
  )
}

export function setQuotaOverride(
  db: DatabaseSync,
  input: {
    adminUserId: string
    targetUserId: string
    extraUnits: number
    expiresAt: number
    reason: string
  },
  now = Date.now(),
): AdminQuotaOverride {
  const extraUnits = Math.floor(Number(input.extraUnits))
  const expiresAt = Math.floor(Number(input.expiresAt))
  const reason = input.reason.trim().slice(0, 200)
  if (!userExists(db, input.adminUserId) || !userExists(db, input.targetUserId)) {
    throw new InputError("管理员或目标用户不存在")
  }
  if (!Number.isFinite(extraUnits) || extraUnits < 1 || extraUnits > 100_000) {
    throw new InputError("额外额度必须在 1 到 100000 单位之间")
  }
  if (!Number.isFinite(expiresAt) || expiresAt <= now) {
    throw new InputError("额度覆盖过期时间必须晚于当前时间")
  }
  if (reason.length < 2) throw new InputError("请填写额度覆盖原因")

  db.exec("BEGIN IMMEDIATE")
  try {
    db.prepare(
      `INSERT INTO user_quota_overrides
        (user_id, extra_units, expires_at, reason, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         extra_units = excluded.extra_units,
         expires_at = excluded.expires_at,
         reason = excluded.reason,
         created_by = excluded.created_by,
         updated_at = excluded.updated_at`,
    ).run(
      input.targetUserId,
      extraUnits,
      expiresAt,
      reason,
      input.adminUserId,
      now,
      now,
    )
    audit(
      db,
      input.adminUserId,
      "quota_override_set",
      input.targetUserId,
      { extraUnits, expiresAt, reason },
      now,
    )
    db.exec("COMMIT")
  } catch (error) {
    db.exec("ROLLBACK")
    throw error
  }
  return { extraUnits, expiresAt, reason, updatedAt: now }
}

export function revokeQuotaOverride(
  db: DatabaseSync,
  input: {
    adminUserId: string
    targetUserId: string
    reason: string
  },
  now = Date.now(),
): void {
  if (!userExists(db, input.adminUserId) || !userExists(db, input.targetUserId)) {
    throw new InputError("管理员或目标用户不存在")
  }
  const reason = input.reason.trim().slice(0, 200) || "管理员撤销额度覆盖"
  db.exec("BEGIN IMMEDIATE")
  try {
    db.prepare("DELETE FROM user_quota_overrides WHERE user_id = ?")
      .run(input.targetUserId)
    audit(
      db,
      input.adminUserId,
      "quota_override_revoke",
      input.targetUserId,
      { reason },
      now,
    )
    db.exec("COMMIT")
  } catch (error) {
    db.exec("ROLLBACK")
    throw error
  }
}

export function listAdminUsers(
  db: DatabaseSync,
  options: { query?: string; limit?: number; now?: number } = {},
): AdminUserRow[] {
  const query = options.query?.trim().toLowerCase().slice(0, 120) ?? ""
  const limit = Math.max(1, Math.min(100, Math.floor(options.limit ?? 50)))
  const now = options.now ?? Date.now()
  const pattern = `%${query}%`
  const rows = db.prepare(
    `SELECT
       u.id,
       u.email,
       u.display_name,
       u.created_at,
       (SELECT MAX(last_seen_at) FROM auth_sessions s
        WHERE s.user_id = u.id AND s.revoked_at IS NULL) AS last_seen_at,
       (SELECT COUNT(*) FROM projects p WHERE p.owner_id = u.id) AS project_count,
       o.extra_units,
       o.expires_at,
       o.reason
     FROM users u
     LEFT JOIN user_quota_overrides o ON o.user_id = u.id
     WHERE ? = ''
        OR lower(u.email) LIKE ?
        OR lower(u.display_name) LIKE ?
     ORDER BY u.created_at DESC
     LIMIT ?`,
  ).all(query, pattern, pattern, limit) as Array<{
    id: string
    email: string | null
    display_name: string
    created_at: number
    last_seen_at: number | null
    project_count: number
    extra_units: number | null
    expires_at: number | null
    reason: string | null
  }>
  return rows.map((row) => {
    const quota = getQuota(db, row.id, now)
    const extraUnits = effectiveQuotaExtraUnits(db, row.id, now)
    return {
      id: row.id,
      email: row.email,
      username: row.display_name,
      createdAt: Number(row.created_at),
      lastSeenAt: row.last_seen_at === null ? null : Number(row.last_seen_at),
      projectCount: Number(row.project_count) || 0,
      quota: {
        used: quota.used,
        limit: quota.limit,
        remaining: quota.remaining,
        extraUnits,
        expiresAt: extraUnits > 0 && row.expires_at !== null
          ? Number(row.expires_at)
          : null,
        reason: extraUnits > 0 ? row.reason ?? "" : "",
      },
    }
  })
}

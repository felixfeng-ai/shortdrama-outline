import type { DatabaseSync } from "node:sqlite"

import type { AuthUser } from "../auth/service.ts"

export const ADMIN_EMAIL_ENV = "ADMIN_EMAILS"

export class AdminForbiddenError extends Error {
  readonly status = 403

  constructor(message = "当前账号没有管理员权限") {
    super(message)
    this.name = "AdminForbiddenError"
  }
}

function allowedEmails(env: Record<string, string | undefined>): Set<string> {
  return new Set(
    (env[ADMIN_EMAIL_ENV] ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  )
}

export function isAdminUser(
  db: DatabaseSync | null,
  user: AuthUser | null,
  env: Record<string, string | undefined> = process.env,
): boolean {
  if (!user) return false
  if (user.email && allowedEmails(env).has(user.email.toLowerCase())) return true
  if (!db) return false
  const row = db.prepare(
    "SELECT 1 AS ok FROM admin_users WHERE user_id = ?",
  ).get(user.id) as { ok: number } | undefined
  return row?.ok === 1
}

export function requireAdminUser(
  db: DatabaseSync | null,
  user: AuthUser | null,
  env: Record<string, string | undefined> = process.env,
): AuthUser {
  if (!isAdminUser(db, user, env)) throw new AdminForbiddenError()
  return user!
}

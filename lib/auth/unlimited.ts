import type { DatabaseSync } from "node:sqlite"

export const UNLIMITED_QUOTA_ACCOUNTS_ENV = "UNLIMITED_QUOTA_ACCOUNTS"

function normalizeAccount(value: unknown): string {
  return typeof value === "string"
    ? value.trim().replace(/^@/, "").toLowerCase()
    : ""
}

function configuredAccounts(env: Record<string, string | undefined>): Set<string> {
  const raw = env[UNLIMITED_QUOTA_ACCOUNTS_ENV]?.trim()
    || process.env[UNLIMITED_QUOTA_ACCOUNTS_ENV]?.trim()
  if (!raw) return new Set()
  return new Set(
    raw
      .split(/[,;]/)
      .map(normalizeAccount)
      .filter(Boolean),
  )
}

/**
 * 管理账号只由服务端环境变量授权。命中后允许无限额度与短时限流豁免，
 * 但不会绕过上游供应商自身的余额、鉴权和频率限制。
 */
export function isUnlimitedQuotaIdentity(
  db: DatabaseSync,
  identity: string,
  env: Record<string, string | undefined> = process.env,
): boolean {
  const accounts = configuredAccounts(env)
  if (accounts.size === 0) return false

  const normalizedIdentity = normalizeAccount(identity)
  if (!normalizedIdentity) return false
  if (accounts.has(normalizedIdentity)) return true

  const row = db.prepare(
    "SELECT id, email, phone, display_name FROM users WHERE id = ?",
  ).get(identity) as {
    id: string
    email: string | null
    phone: string | null
    display_name: string
  } | undefined
  if (!row) return false

  return [row.id, row.email, row.phone, row.display_name]
    .map(normalizeAccount)
    .some((candidate) => candidate && accounts.has(candidate))
}

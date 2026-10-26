import type { DatabaseSync } from "node:sqlite"
import { createHash, randomBytes, randomInt, randomUUID } from "node:crypto"

export interface AuthUser {
  id: string
  phone: string
  displayName: string
  createdAt: number
}

export interface AuthSessionResult {
  user: AuthUser
  token: string
  expiresAt: number
}

export class AuthError extends Error {
  status = 400
  constructor(message: string, status = 400) {
    super(message)
    this.name = "AuthError"
    this.status = status
  }
}

export function normalizePhone(value: unknown): string {
  const raw = typeof value === "string" ? value.trim().replaceAll(" ", "").replaceAll("-", "") : ""
  const digits = raw.startsWith("+86") ? raw.slice(3) : raw
  if (!/^1[3-9]\d{9}$/.test(digits)) throw new AuthError("手机号不正确")
  return `+86${digits}`
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

function codeHash(phone: string, code: string, secret: string): string {
  return hash(`${phone}:${code}:${secret}`)
}

function authSecret(value?: string): string {
  const secret = value?.trim() || process.env.AUTH_SECRET?.trim()
  if (!secret) throw new AuthError("登录服务未配置", 503)
  return secret
}

function userRow(row: Record<string, unknown>): AuthUser {
  return {
    id: String(row.id),
    phone: String(row.phone),
    displayName: String(row.display_name),
    createdAt: Number(row.created_at),
  }
}

export function requestLoginCode(
  db: DatabaseSync,
  phone: string,
  options: { now?: number; secret?: string; dev?: boolean } = {},
): { devCode?: string; expiresAt: number; cooldownSeconds: number } {
  const now = options.now ?? Date.now()
  const normalized = normalizePhone(phone)
  const secret = authSecret(options.secret)
  const latest = db.prepare(
    "SELECT created_at FROM login_codes WHERE phone = ? ORDER BY created_at DESC LIMIT 1",
  ).get(normalized) as { created_at: number } | undefined
  if (latest && now - latest.created_at < 60_000) {
    throw new AuthError("验证码发送过于频繁，请稍后再试", 429)
  }
  const recent = db.prepare(
    "SELECT COUNT(*) AS n FROM login_codes WHERE phone = ? AND created_at > ?",
  ).get(normalized, now - 60 * 60_000) as { n: number }
  if (recent.n >= 5) throw new AuthError("验证码发送次数过多，请稍后再试", 429)

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0")
  const expiresAt = now + 5 * 60_000
  db.prepare(
    `INSERT INTO login_codes
      (id, phone, code_hash, attempts, expires_at, consumed_at, created_at)
     VALUES (?, ?, ?, 0, ?, NULL, ?)`,
  ).run(randomUUID(), normalized, codeHash(normalized, code, secret), expiresAt, now)
  return {
    ...(options.dev ? { devCode: code } : {}),
    expiresAt,
    cooldownSeconds: 60,
  }
}

export function verifyLoginCode(
  db: DatabaseSync,
  phone: string,
  code: string,
  options: { now?: number; secret?: string } = {},
): AuthSessionResult {
  const now = options.now ?? Date.now()
  const normalized = normalizePhone(phone)
  const secret = authSecret(options.secret)
  const row = db.prepare(
    `SELECT * FROM login_codes
     WHERE phone = ? AND consumed_at IS NULL
     ORDER BY created_at DESC LIMIT 1`,
  ).get(normalized) as {
    id: string
    code_hash: string
    attempts: number
    expires_at: number
  } | undefined
  if (!row || row.expires_at <= now) throw new AuthError("验证码已过期，请重新获取")
  if (row.attempts >= 5) throw new AuthError("验证码尝试次数过多，请重新获取", 429)
  if (row.code_hash !== codeHash(normalized, code.trim(), secret)) {
    db.prepare("UPDATE login_codes SET attempts = attempts + 1 WHERE id = ?").run(row.id)
    throw new AuthError("验证码错误")
  }

  let user = db.prepare("SELECT * FROM users WHERE phone = ?").get(normalized) as Record<string, unknown> | undefined
  if (!user) {
    const id = `user_${randomUUID()}`
    const createdAt = now
    db.prepare(
      "INSERT INTO users (id, phone, display_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    ).run(id, normalized, `用户${normalized.slice(-4)}`, createdAt, createdAt)
    user = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as Record<string, unknown>
  }

  db.prepare("UPDATE login_codes SET consumed_at = ? WHERE id = ?").run(now, row.id)
  const token = randomBytes(32).toString("base64url")
  const tokenId = hash(token)
  const expiresAt = now + 30 * 24 * 60 * 60_000
  db.prepare(
    `INSERT INTO auth_sessions
      (id, user_id, created_at, expires_at, last_seen_at, revoked_at)
     VALUES (?, ?, ?, ?, ?, NULL)`,
  ).run(tokenId, String(user.id), now, expiresAt, now)
  return {
    user: userRow(user),
    token,
    expiresAt,
  }
}

export function userFromSessionToken(
  db: DatabaseSync,
  token: string,
  now = Date.now(),
): AuthUser | null {
  if (!token.trim()) return null
  const row = db.prepare(
    `SELECT u.* FROM auth_sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.id = ? AND s.revoked_at IS NULL AND s.expires_at > ?`,
  ).get(hash(token.trim()), now) as Record<string, unknown> | undefined
  if (!row) return null
  db.prepare("UPDATE auth_sessions SET last_seen_at = ? WHERE id = ?").run(now, hash(token.trim()))
  return userRow(row)
}

export function revokeSessionToken(
  db: DatabaseSync,
  token: string,
  now = Date.now(),
): boolean {
  if (!token.trim()) return false
  const result = db.prepare(
    "UPDATE auth_sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL",
  ).run(now, hash(token.trim()))
  return Number(result.changes) > 0
}

export function claimAnonymousProjects(
  db: DatabaseSync,
  anonymousOwnerId: string,
  userId: string,
): { projects: number; pushSubscriptions: number } {
  if (!anonymousOwnerId.startsWith("anon_")) return { projects: 0, pushSubscriptions: 0 }
  db.exec("BEGIN")
  try {
    const projects = db.prepare(
      "UPDATE projects SET owner_id = ?, updated_at = ? WHERE owner_id = ?",
    ).run(userId, Date.now(), anonymousOwnerId)
    const pushSubscriptions = db.prepare(
      "UPDATE push_subscriptions SET owner_id = ?, updated_at = ? WHERE owner_id = ?",
    ).run(userId, Date.now(), anonymousOwnerId)
    db.exec("COMMIT")
    return {
      projects: Number(projects.changes),
      pushSubscriptions: Number(pushSubscriptions.changes),
    }
  } catch (error) {
    db.exec("ROLLBACK")
    throw error
  }
}

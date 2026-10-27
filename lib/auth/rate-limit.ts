import type { DatabaseSync } from "node:sqlite"

import { AuthError } from "./service.ts"

const TEN_MINUTES = 10 * 60_000
const ONE_DAY = 24 * 60 * 60_000

interface RateLimitRule {
  bucket: string
  subject: string
  limit: number
  windowMs: number
  message: string
}

function envLimit(
  env: Record<string, string | undefined>,
  name: string,
  fallback: number,
): number {
  const value = Number(env[name]?.trim())
  return Number.isSafeInteger(value) && value > 0 ? value : fallback
}

export function clientIpFromRequest(req: Request): string {
  const value = req.headers.get("x-real-ip")?.trim() ?? ""
  if (value.length > 0 && value.length <= 64 && /^[0-9a-fA-F:.]+$/.test(value)) {
    return value
  }
  return "unknown"
}

export function enforceVerificationRateLimits(
  db: DatabaseSync,
  req: Request,
  options: {
    now?: number
    env?: Record<string, string | undefined>
  } = {},
): void {
  const now = options.now ?? Date.now()
  const env = options.env ?? process.env
  const ip = clientIpFromRequest(req)
  const rules: RateLimitRule[] = [
    {
      bucket: "verification-ip-10m",
      subject: ip,
      limit: envLimit(env, "AUTH_CODE_IP_10M_LIMIT", 5),
      windowMs: TEN_MINUTES,
      message: "验证码请求过于频繁，请稍后再试",
    },
    {
      bucket: "verification-ip-day",
      subject: ip,
      limit: envLimit(env, "AUTH_CODE_IP_DAILY_LIMIT", 20),
      windowMs: ONE_DAY,
      message: "验证码请求过于频繁，请稍后再试",
    },
    {
      bucket: "verification-global-day",
      subject: "all",
      limit: envLimit(env, "AUTH_CODE_GLOBAL_DAILY_LIMIT", 200),
      windowMs: ONE_DAY,
      message: "验证码请求过多，请稍后再试",
    },
  ]

  db.exec("BEGIN IMMEDIATE")
  try {
    const states = rules.map((rule) => {
      const row = db.prepare(
        `SELECT window_started_at, count
         FROM auth_rate_limits
         WHERE bucket = ? AND subject = ?`,
      ).get(rule.bucket, rule.subject) as {
        window_started_at: number
        count: number
      } | undefined
      const fresh = !row || now - Number(row.window_started_at) >= rule.windowMs
      const count = fresh ? 0 : Number(row.count)
      if (count >= rule.limit) throw new AuthError(rule.message, 429)
      return {
        rule,
        nextCount: count + 1,
        windowStartedAt: fresh ? now : Number(row!.window_started_at),
      }
    })

    const upsert = db.prepare(
      `INSERT INTO auth_rate_limits
        (bucket, subject, window_started_at, count, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(bucket, subject) DO UPDATE SET
         window_started_at = excluded.window_started_at,
         count = excluded.count,
         updated_at = excluded.updated_at`,
    )
    for (const state of states) {
      upsert.run(
        state.rule.bucket,
        state.rule.subject,
        state.windowStartedAt,
        state.nextCount,
        now,
      )
    }
    db.exec("COMMIT")
  } catch (error) {
    db.exec("ROLLBACK")
    throw error
  }
}

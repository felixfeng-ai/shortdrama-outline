import { createHash } from "node:crypto"
import type { DatabaseSync } from "node:sqlite"

import { clientIpFromRequest } from "../auth/rate-limit.ts"

const TEN_MINUTES = 10 * 60_000
const ONE_DAY = 24 * 60 * 60_000

export type ApiRateLimitGroup = "model" | "assistant" | "image" | "export" | "import"

interface ApiRateLimitPolicy {
  group: ApiRateLimitGroup
  label: string
  message: string
  ipLimit: { env: string; fallback: number; windowMs: number }
  identityLimit: { env: string; fallback: number; windowMs: number }
  globalLimit: { env: string; fallback: number; windowMs: number }
}

export const API_RATE_LIMIT_POLICIES: Record<ApiRateLimitGroup, ApiRateLimitPolicy> = {
  model: {
    group: "model",
    label: "文本生成",
    message: "生成请求过于频繁，请稍后再试",
    ipLimit: { env: "API_MODEL_IP_10M_LIMIT", fallback: 60, windowMs: TEN_MINUTES },
    identityLimit: { env: "API_MODEL_IDENTITY_10M_LIMIT", fallback: 30, windowMs: TEN_MINUTES },
    globalLimit: { env: "API_MODEL_GLOBAL_DAILY_LIMIT", fallback: 2_000, windowMs: ONE_DAY },
  },
  assistant: {
    group: "assistant",
    label: "场记助手",
    message: "场记请求过于频繁，请稍后再试",
    ipLimit: { env: "API_ASSISTANT_IP_10M_LIMIT", fallback: 40, windowMs: TEN_MINUTES },
    identityLimit: { env: "API_ASSISTANT_IDENTITY_10M_LIMIT", fallback: 20, windowMs: TEN_MINUTES },
    globalLimit: { env: "API_ASSISTANT_GLOBAL_DAILY_LIMIT", fallback: 1_500, windowMs: ONE_DAY },
  },
  image: {
    group: "image",
    label: "图像生成",
    message: "图像生成请求过于频繁，请稍后再试",
    ipLimit: { env: "API_IMAGE_IP_10M_LIMIT", fallback: 20, windowMs: TEN_MINUTES },
    identityLimit: { env: "API_IMAGE_IDENTITY_10M_LIMIT", fallback: 10, windowMs: TEN_MINUTES },
    globalLimit: { env: "API_IMAGE_GLOBAL_DAILY_LIMIT", fallback: 500, windowMs: ONE_DAY },
  },
  export: {
    group: "export",
    label: "项目导出",
    message: "导出请求过于频繁，请稍后再试",
    ipLimit: { env: "API_EXPORT_IP_10M_LIMIT", fallback: 30, windowMs: TEN_MINUTES },
    identityLimit: { env: "API_EXPORT_IDENTITY_10M_LIMIT", fallback: 20, windowMs: TEN_MINUTES },
    globalLimit: { env: "API_EXPORT_GLOBAL_DAILY_LIMIT", fallback: 1_000, windowMs: ONE_DAY },
  },
  import: {
    group: "import",
    label: "项目导入",
    message: "导入请求过于频繁，请稍后再试",
    ipLimit: { env: "API_IMPORT_IP_10M_LIMIT", fallback: 10, windowMs: TEN_MINUTES },
    identityLimit: { env: "API_IMPORT_IDENTITY_10M_LIMIT", fallback: 5, windowMs: TEN_MINUTES },
    globalLimit: { env: "API_IMPORT_GLOBAL_DAILY_LIMIT", fallback: 200, windowMs: ONE_DAY },
  },
}

export class RequestRateLimitError extends Error {
  readonly status = 429
  readonly retryAfterSeconds: number

  constructor(message: string, retryAfterSeconds: number) {
    super(message)
    this.name = "RequestRateLimitError"
    this.retryAfterSeconds = Math.max(1, Math.ceil(retryAfterSeconds))
  }
}

interface RateRule {
  bucket: string
  subject: string
  limit: number
  windowMs: number
  scope: "ip" | "identity" | "global"
}

function envLimit(
  env: Record<string, string | undefined>,
  name: string,
  fallback: number,
): number {
  const value = Number(env[name]?.trim())
  return Number.isSafeInteger(value) && value > 0 ? value : fallback
}

function hashedSubject(subject: string): string {
  return createHash("sha256").update(subject).digest("hex").slice(0, 12)
}

function alertLimitHit(group: ApiRateLimitGroup, rule: RateRule): void {
  console.warn(JSON.stringify({
    event: "api_rate_limit_exceeded",
    group,
    scope: rule.scope,
    bucket: rule.bucket,
    subjectHash: hashedSubject(rule.subject),
    limit: rule.limit,
    windowMs: rule.windowMs,
    at: Date.now(),
  }))
}

/**
 * 所有规则先检查、后统一递增。任一规则超限时不消耗其他桶的计数，
 * 避免“被拒绝的请求反而把自己的重试窗口继续推远”。
 */
export function enforceApiRateLimit(
  db: DatabaseSync,
  req: Request,
  group: ApiRateLimitGroup,
  options: {
    identity: string
    now?: number
    env?: Record<string, string | undefined>
  },
): void {
  const policy = API_RATE_LIMIT_POLICIES[group]
  const now = options.now ?? Date.now()
  const env = options.env ?? process.env
  const ip = clientIpFromRequest(req)
  const identity = options.identity.trim() || "unknown"
  const rules: RateRule[] = [
    {
      bucket: `api:${group}:ip:10m`,
      subject: ip,
      limit: envLimit(env, policy.ipLimit.env, policy.ipLimit.fallback),
      windowMs: policy.ipLimit.windowMs,
      scope: "ip",
    },
    {
      bucket: `api:${group}:identity:10m`,
      subject: identity,
      limit: envLimit(env, policy.identityLimit.env, policy.identityLimit.fallback),
      windowMs: policy.identityLimit.windowMs,
      scope: "identity",
    },
    {
      bucket: `api:${group}:global:day`,
      subject: "all",
      limit: envLimit(env, policy.globalLimit.env, policy.globalLimit.fallback),
      windowMs: policy.globalLimit.windowMs,
      scope: "global",
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
      if (count >= rule.limit) {
        const retryAfterMs = fresh
          ? rule.windowMs
          : Math.max(1_000, Number(row!.window_started_at) + rule.windowMs - now)
        alertLimitHit(group, rule)
        throw new RequestRateLimitError(policy.message, retryAfterMs / 1_000)
      }
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

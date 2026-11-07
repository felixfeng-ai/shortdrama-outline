import { createHash } from "node:crypto"
import type { DatabaseSync } from "node:sqlite"

import { clientIpFromRequest } from "../auth/rate-limit.ts"

const TEN_MINUTES = 10 * 60_000
const ONE_DAY = 24 * 60 * 60_000

export type ApiRateLimitGroup =
  | "model"
  | "assistant"
  | "image"
  | "video"
  | "audio"
  | "novel"
  | "export"
  | "import"
  | "material"

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
  video: {
    group: "video",
    label: "视频生成",
    message: "视频生成请求过于频繁，请稍后再试",
    ipLimit: { env: "API_VIDEO_IP_10M_LIMIT", fallback: 10, windowMs: TEN_MINUTES },
    identityLimit: { env: "API_VIDEO_IDENTITY_10M_LIMIT", fallback: 5, windowMs: TEN_MINUTES },
    globalLimit: { env: "API_VIDEO_GLOBAL_DAILY_LIMIT", fallback: 200, windowMs: ONE_DAY },
  },
  audio: {
    group: "audio",
    label: "语音生成",
    message: "语音生成请求过于频繁，请稍后再试",
    ipLimit: { env: "API_AUDIO_IP_10M_LIMIT", fallback: 30, windowMs: TEN_MINUTES },
    identityLimit: { env: "API_AUDIO_IDENTITY_10M_LIMIT", fallback: 15, windowMs: TEN_MINUTES },
    globalLimit: { env: "API_AUDIO_GLOBAL_DAILY_LIMIT", fallback: 800, windowMs: ONE_DAY },
  },
  novel: {
    group: "novel",
    label: "小说生成",
    message: "小说生成请求过于频繁，请稍后再试",
    ipLimit: { env: "API_NOVEL_IP_10M_LIMIT", fallback: 20, windowMs: TEN_MINUTES },
    identityLimit: { env: "API_NOVEL_IDENTITY_10M_LIMIT", fallback: 10, windowMs: TEN_MINUTES },
    globalLimit: { env: "API_NOVEL_GLOBAL_DAILY_LIMIT", fallback: 400, windowMs: ONE_DAY },
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
  material: {
    group: "material",
    label: "项目原文写入",
    message: "原文写入过于频繁，请稍后再试",
    ipLimit: { env: "API_MATERIAL_IP_10M_LIMIT", fallback: 20, windowMs: TEN_MINUTES },
    identityLimit: { env: "API_MATERIAL_IDENTITY_10M_LIMIT", fallback: 12, windowMs: TEN_MINUTES },
    globalLimit: { env: "API_MATERIAL_GLOBAL_DAILY_LIMIT", fallback: 500, windowMs: ONE_DAY },
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

export interface ApiRateLimitAvailability {
  group: ApiRateLimitGroup
  label: string
  scope: RateRule["scope"]
  limit: number
  used: number
  remaining: number
  resetAt: number
  retryAfterSeconds: number
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
 * 只读查询当前请求最严格的限流余额，不创建计数窗口。
 * 批量入口先用它决定能提交多少项，避免把必然被拒绝的任务发给服务端。
 */
export function getApiRateLimitAvailability(
  db: DatabaseSync,
  req: Request,
  group: ApiRateLimitGroup,
  options: {
    identity: string
    now?: number
    env?: Record<string, string | undefined>
  },
): ApiRateLimitAvailability {
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

  let strictest: ApiRateLimitAvailability | null = null
  for (const rule of rules) {
    const row = db.prepare(
      `SELECT window_started_at, count
       FROM auth_rate_limits
       WHERE bucket = ? AND subject = ?`,
    ).get(rule.bucket, rule.subject) as {
      window_started_at: number
      count: number
    } | undefined
    const fresh = !row || now - Number(row.window_started_at) >= rule.windowMs
    const used = fresh ? 0 : Math.max(0, Number(row!.count))
    const resetAt = fresh ? now + rule.windowMs : Number(row!.window_started_at) + rule.windowMs
    const candidate: ApiRateLimitAvailability = {
      group,
      label: policy.label,
      scope: rule.scope,
      limit: rule.limit,
      used,
      remaining: Math.max(0, rule.limit - used),
      resetAt,
      retryAfterSeconds: Math.max(0, Math.ceil((resetAt - now) / 1_000)),
    }
    if (
      !strictest
      || candidate.remaining < strictest.remaining
      || (candidate.remaining === strictest.remaining && candidate.resetAt < strictest.resetAt)
    ) {
      strictest = candidate
    }
  }
  return strictest!
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

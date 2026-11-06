// 额度控制与消费熔断。
//
// 为什么必须有这个文件：六个生成接口全部是公开的、且每次调用都在花真金白银。
// lib/validate.ts 只卡了「单次入参大小」，挡不住「同一个人反复刷」——
// 没有这一层，托管版的 DeepSeek 账单是敞口的。
//
// 设计要点：
//   1. 身份用「匿名指纹」而不是登录——额度内不要求注册，保住「打开即用」
//   2. 两道闸：单身份日额度（防单点刷）+ 全站日熔断（兜底防被刷爆）
//   3. 计数落在 SQLite（和资产链同一个库），进程重启不丢
//   4. 所有判定都是「先查再扣」，超限直接拒绝，不进入模型调用
import type { DatabaseSync } from "node:sqlite"
import { randomUUID } from "node:crypto"
import { ownerFromRequest } from "./session.ts"
import { FULL_PROJECT_COST, QUOTA_PRICING_VERSION, STEP_COST } from "./model-pricing.ts"

// 兼容既有调用方：价格表已抽到纯模块，服务端继续从这里取同一口径。
export { FULL_PROJECT_COST, STEP_COST }

function envInt(name: string, fallback: number): number {
  const raw = process.env[name]
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback
}

/**
 * 单个匿名身份每天可用额度：默认 5 个 10 集基准项目（65 单位）。
 *
 * 为什么是 5 而不是 2：一条完整流程 13 单位，2 个项目意味着重跑两次分镜就见底，
 * 用户还没走完一轮试错就被告知「明天再来」——那不是成本控制，是把人劝走。
 * 5 个留出「试两遍 + 改一版」的空间，同时仍是敞口的硬上限。
 */
export const DAILY_UNITS_PER_IDENTITY = envInt("CHENGJU_DAILY_UNITS", FULL_PROJECT_COST * 5)

/** 全站每天总熔断阈值（按 300 个 10 集基准项目估算成本硬顶） */
export const DAILY_UNITS_GLOBAL = envInt("CHENGJU_DAILY_UNITS_GLOBAL", FULL_PROJECT_COST * 300)

/** 建表：幂等，重复调用不报错 */
export function ensureQuotaSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS usage_log (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      identity   TEXT NOT NULL,
      step       TEXT NOT NULL,
      units      INTEGER NOT NULL,
      day        TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_usage_identity_day ON usage_log(identity, day);
    CREATE INDEX IF NOT EXISTS idx_usage_day ON usage_log(day);
    CREATE TABLE IF NOT EXISTS billing_entitlements (
      id             TEXT PRIMARY KEY,
      owner_id       TEXT NOT NULL,
      transaction_id TEXT NOT NULL UNIQUE REFERENCES billing_transactions(id) ON DELETE CASCADE,
      units          INTEGER NOT NULL,
      starts_at      INTEGER NOT NULL,
      expires_at     INTEGER NOT NULL,
      created_at     INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_billing_entitlements_owner
      ON billing_entitlements(owner_id, expires_at);
  `)

  const usageColumns = db.prepare("PRAGMA table_info(usage_log)").all() as { name: string }[]
  const addUsageColumn = (name: string, sql: string) => {
    if (!usageColumns.some((column) => column.name === name)) db.exec(sql)
  }
  addUsageColumn("reservation_id", "ALTER TABLE usage_log ADD COLUMN reservation_id TEXT")
  addUsageColumn("group_id", "ALTER TABLE usage_log ADD COLUMN group_id TEXT NOT NULL DEFAULT ''")
  addUsageColumn("resource", "ALTER TABLE usage_log ADD COLUMN resource TEXT NOT NULL DEFAULT ''")
  addUsageColumn("pricing_version", "ALTER TABLE usage_log ADD COLUMN pricing_version TEXT NOT NULL DEFAULT ''")

  db.exec(`
    CREATE TABLE IF NOT EXISTS usage_reservations (
      id             TEXT PRIMARY KEY,
      identity       TEXT NOT NULL,
      request_id     TEXT NOT NULL UNIQUE,
      group_id       TEXT NOT NULL DEFAULT '',
      resource       TEXT NOT NULL,
      day            TEXT NOT NULL,
      reserved_units INTEGER NOT NULL,
      settled_units  INTEGER NOT NULL DEFAULT 0,
      status         TEXT NOT NULL DEFAULT 'reserved',
      reason         TEXT NOT NULL DEFAULT '',
      pricing_version TEXT NOT NULL,
      created_at     INTEGER NOT NULL,
      expires_at     INTEGER NOT NULL,
      settled_at     INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_usage_log_group
      ON usage_log(group_id, day);
    CREATE INDEX IF NOT EXISTS idx_usage_reservations_identity_day
      ON usage_reservations(identity, day, status, expires_at);
    CREATE INDEX IF NOT EXISTS idx_usage_reservations_group
      ON usage_reservations(group_id, day, status, expires_at);
  `)
}

/** 当天日期键（UTC，够用且不受服务器时区影响） */
/**
 * 额度按「北京时间」的日历日结算，而不是 UTC。
 *
 * 为什么必须写死时区：服务器在香港/UTC 上跑，用 toISOString() 切出来的「今天」
 * 会在北京时间早上 8 点才翻页——用户凌晨看到的还是昨天的账，
 * 文案却写着「明天恢复」，对不上。时区可用 CHENGJU_TZ 覆盖，默认 Asia/Shanghai。
 */
export const QUOTA_TIME_ZONE = process.env.CHENGJU_TZ || "Asia/Shanghai"

export function todayKey(now = Date.now()): string {
  // en-CA 的日期格式就是 YYYY-MM-DD，正好当主键用
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: QUOTA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(now))
}

export interface QuotaSnapshot {
  /** 该身份今天已用 */
  used: number
  /** 该身份今天可用总额度 */
  limit: number
  /** 全站今天已用 */
  globalUsed: number
  /** 全站今天熔断阈值 */
  globalLimit: number
  /** 该身份剩余 */
  remaining: number
}

/** 查当前用量（不改动任何状态） */
export function getQuota(
  db: DatabaseSync,
  identity: string,
  now = Date.now(),
): QuotaSnapshot {
  const day = todayKey(now)
  const mine = db.prepare(
    "SELECT COALESCE(SUM(units), 0) AS u FROM usage_log WHERE identity = ? AND day = ?",
  ).get(identity, day) as { u: number }
  const all = db.prepare(
    "SELECT COALESCE(SUM(units), 0) AS u FROM usage_log WHERE day = ?",
  ).get(day) as { u: number }
  const held = db.prepare(
    `SELECT COALESCE(SUM(reserved_units), 0) AS u
     FROM usage_reservations
     WHERE identity = ? AND day = ? AND status = 'reserved' AND expires_at > ?`,
  ).get(identity, day, now) as { u: number }
  const heldAll = db.prepare(
    `SELECT COALESCE(SUM(reserved_units), 0) AS u
     FROM usage_reservations
     WHERE day = ? AND status = 'reserved' AND expires_at > ?`,
  ).get(day, now) as { u: number }
  const grants = db.prepare(
    `SELECT COALESCE(SUM(units), 0) AS u
     FROM billing_entitlements
     WHERE owner_id = ? AND starts_at <= ? AND expires_at > ?`,
  ).get(identity, now, now) as { u: number }
  const limit = DAILY_UNITS_PER_IDENTITY + Number(grants.u || 0)

  return {
    used: mine.u + held.u,
    limit,
    globalUsed: all.u + heldAll.u,
    globalLimit: DAILY_UNITS_GLOBAL,
    remaining: Math.max(0, limit - mine.u - held.u),
  }
}

export class QuotaError extends Error {
  status = 429
  constructor(message: string) {
    super(message)
    this.name = "QuotaError"
  }
}

export type QuotaReservationStatus = "reserved" | "settled" | "released" | "expired"

export interface QuotaReservation {
  id: string
  identity: string
  requestId: string
  groupId: string
  resource: string
  day: string
  units: number
  settledUnits: number
  status: QuotaReservationStatus
  reason: string
  pricingVersion: string
  createdAt: number
  expiresAt: number
  settledAt: number | null
}

interface ReservationRow {
  id: string
  identity: string
  request_id: string
  group_id: string
  resource: string
  day: string
  reserved_units: number
  settled_units: number
  status: QuotaReservationStatus
  reason: string
  pricing_version: string
  created_at: number
  expires_at: number
  settled_at: number | null
}

function toReservation(row: ReservationRow): QuotaReservation {
  return {
    id: row.id,
    identity: row.identity,
    requestId: row.request_id,
    groupId: row.group_id,
    resource: row.resource,
    day: row.day,
    units: row.reserved_units,
    settledUnits: row.settled_units,
    status: row.status,
    reason: row.reason,
    pricingVersion: row.pricing_version,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    settledAt: row.settled_at,
  }
}

function findReservation(db: DatabaseSync, id: string): QuotaReservation | null {
  const row = db.prepare("SELECT * FROM usage_reservations WHERE id = ?").get(id) as ReservationRow | undefined
  return row ? toReservation(row) : null
}

function groupUsed(db: DatabaseSync, groupId: string, day: string, now: number): number {
  if (!groupId) return 0
  const settled = db.prepare(
    "SELECT COALESCE(SUM(units), 0) AS u FROM usage_log WHERE group_id = ? AND day = ?",
  ).get(groupId, day) as { u: number }
  const held = db.prepare(
    `SELECT COALESCE(SUM(reserved_units), 0) AS u
     FROM usage_reservations
     WHERE group_id = ? AND day = ? AND status = 'reserved' AND expires_at > ?`,
  ).get(groupId, day, now) as { u: number }
  return settled.u + held.u
}

export function reserveQuota(
  db: DatabaseSync,
  identity: string,
  step: string,
  options: {
    requestId?: string
    units?: number
    groupId?: string
    groupLimit?: number
    ttlMs?: number
    now?: number
  } = {},
): QuotaReservation {
  const now = options.now ?? Date.now()
  const requestId = options.requestId?.trim() || randomUUID()
  const existing = db.prepare("SELECT * FROM usage_reservations WHERE request_id = ?")
    .get(requestId) as ReservationRow | undefined
  if (existing) return toReservation(existing)

  const units = Math.max(1, Math.floor(options.units ?? STEP_COST[step] ?? 1))
  const day = todayKey(now)
  const groupId = options.groupId?.trim() || ""
  const ttlMs = Math.max(30_000, Math.floor(options.ttlMs ?? 30 * 60_000))

  db.exec("BEGIN IMMEDIATE")
  try {
    const snap = getQuota(db, identity, now)
    if (snap.globalUsed + units > snap.globalLimit) {
      throw new QuotaError("今日全站创作额度已用完，请明天再来")
    }
    if (snap.used + units > snap.limit) {
      throw new QuotaError(
        `今日创作额度已用完（已用 ${snap.used}/${snap.limit}）。请明天再来`,
      )
    }
    if (groupId && options.groupLimit) {
      const used = groupUsed(db, groupId, day, now)
      if (used + units > Math.max(1, Math.floor(options.groupLimit))) {
        throw new QuotaError(`本轮创作额度最多 ${options.groupLimit} 单位，已达到上限`)
      }
    }

    const id = randomUUID()
    db.prepare(
      `INSERT INTO usage_reservations
        (id, identity, request_id, group_id, resource, day, reserved_units, settled_units,
         status, reason, pricing_version, created_at, expires_at, settled_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'reserved', '', ?, ?, ?, NULL)`,
    ).run(
      id,
      identity,
      requestId,
      groupId,
      step,
      day,
      units,
      QUOTA_PRICING_VERSION,
      now,
      now + ttlMs,
    )
    db.exec("COMMIT")
    return findReservation(db, id)!
  } catch (error) {
    db.exec("ROLLBACK")
    throw error
  }
}

export function settleQuota(
  db: DatabaseSync,
  reservationId: string,
  actualUnits?: number,
  now = Date.now(),
): QuotaReservation {
  const reservation = findReservation(db, reservationId)
  if (!reservation) throw new QuotaError("额度预扣记录不存在")
  if (reservation.status !== "reserved") return reservation

  const settled = Math.max(
    0,
    Math.min(reservation.units, Math.floor(actualUnits ?? reservation.units)),
  )
  db.exec("BEGIN IMMEDIATE")
  try {
    if (settled > 0) {
      db.prepare(
        `INSERT INTO usage_log
          (identity, step, units, day, created_at, reservation_id, group_id, resource, pricing_version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        reservation.identity,
        reservation.resource,
        settled,
        reservation.day,
        now,
        reservation.id,
        reservation.groupId,
        reservation.resource,
        reservation.pricingVersion,
      )
    }
    db.prepare(
      `UPDATE usage_reservations
       SET status = ?, settled_units = ?, settled_at = ?
       WHERE id = ?`,
    ).run(settled > 0 ? "settled" : "released", settled, now, reservation.id)
    db.exec("COMMIT")
    return findReservation(db, reservation.id)!
  } catch (error) {
    db.exec("ROLLBACK")
    throw error
  }
}

export function releaseQuota(
  db: DatabaseSync,
  reservationId: string,
  reason = "",
  now = Date.now(),
): QuotaReservation {
  const reservation = findReservation(db, reservationId)
  if (!reservation) throw new QuotaError("额度预扣记录不存在")
  if (reservation.status !== "reserved") return reservation
  db.prepare(
    `UPDATE usage_reservations
     SET status = 'released', reason = ?, settled_at = ?
     WHERE id = ? AND status = 'reserved'`,
  ).run(reason, now, reservation.id)
  return findReservation(db, reservation.id)!
}

/**
 * 同步生成接口的统一额度边界：
 * 模型开始前预扣，业务结果完成后结算，任何异常都释放未结算额度。
 */
export async function withQuotaReservation<T>(
  db: DatabaseSync,
  identity: string,
  step: string,
  units: number,
  operation: () => Promise<T>,
  options: {
    requestId?: string
    groupId?: string
    groupLimit?: number
    ttlMs?: number
    now?: number
  } = {},
): Promise<{ value: T; reservation: QuotaReservation }> {
  const hold = reserveQuota(db, identity, step, { ...options, units })
  try {
    const value = await operation()
    const reservation = settleQuota(db, hold.id, units, options.now)
    return { value, reservation }
  } catch (error) {
    releaseQuota(db, hold.id, error instanceof Error ? error.message : "generation_failed", options.now)
    throw error
  }
}

/**
 * 扣额度。超限抛 QuotaError（status=429，由 errorResponse 翻译成中文）。
 *
 * 为什么要「先查再扣」而不是原子扣减：单进程 fork 模式（ecosystem.config.cjs）
 * 没有并发写竞争，这样写更直白、更容易审计。
 */
export function chargeQuota(
  db: DatabaseSync,
  identity: string,
  step: string,
  now = Date.now(),
  unitsOverride?: number,
): QuotaSnapshot {
  // 分集按批次计价：集数越多，一次请求的 units 越大
  const units = Math.max(1, Math.floor(unitsOverride ?? STEP_COST[step] ?? 1))
  const hold = reserveQuota(db, identity, step, { units, now })
  settleQuota(db, hold.id, units, now)
  return getQuota(db, identity, now)
}

/**
 * 从请求里取匿名身份。
 *
 * 优先用反代透传的真实 IP（Nginx 会给 X-Forwarded-For），没有则退回
 * 几个常见的头，最后兜底一个常量——开发环境全算同一个人。
 */
export function identityFromRequest(req: Request): string {
  const session = ownerFromRequest(req)
  if (session !== "local") return session
  const get = (name: string) => req.headers.get(name)?.split(",")[0]?.trim() || ""
  const ip = get("x-forwarded-for") || get("x-real-ip") || get("cf-connecting-ip")
  return ip || "local"
}

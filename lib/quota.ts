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

/** 每个生成步骤的「权重」——一次调用大概烧多少 token 的比例 */
export const STEP_COST: Record<string, number> = {
  // 入口处的关键词联想：输出只有 3 句短文本，成本很低，但要计一次数
  ideas: 1,
  // AI 认图：只送文件名字符串，输出是一组短配对，比一次定妆便宜
  assetMatch: 1,
  // 放映厅的 AI 助手：一次只改一镜的短问答，成本与联想同级
  assistant: 1,
  characters: 1,
  acts: 1,
  episodes: 3,   // 10 集，输出最大
  visual: 2,     // 定妆 + 定妆图提示词，两次调用
  scenes: 2,
  shots: 4,      // 每镜带锚点，输出最大
}

/**
 * 一个完整项目（六步工作流全走一遍）的额度消耗。
 *
 * 注意：这里必须排除 ideas —— 它是入口的辅助联想，不属于六步流程。
 * 若直接用 Object.values 求和，新增任何辅助步骤都会悄悄抬高
 * 「一个完整项目多少钱」这个对外承诺。
 */
export const FULL_PROJECT_COST = [
  "characters", "acts", "episodes", "visual", "scenes", "shots",
].reduce((sum, step) => sum + (STEP_COST[step] ?? 0), 0) // 13

function envInt(name: string, fallback: number): number {
  const raw = process.env[name]
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback
}

/**
 * 单个匿名身份每天可用额度：默认 5 个完整项目（65 单位）。
 *
 * 为什么是 5 而不是 2：一条完整流程 13 单位，2 个项目意味着重跑两次分镜就见底，
 * 用户还没走完一轮试错就被告知「明天再来」——那不是成本控制，是把人劝走。
 * 5 个留出「试两遍 + 改一版」的空间，同时仍是敞口的硬上限。
 */
export const DAILY_UNITS_PER_IDENTITY = envInt("CHENGJU_DAILY_UNITS", FULL_PROJECT_COST * 5)

/** 全站每天总熔断阈值（默认 300 个完整项目 ≈ 成本上限的硬顶） */
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

  return {
    used: mine.u,
    limit: DAILY_UNITS_PER_IDENTITY,
    globalUsed: all.u,
    globalLimit: DAILY_UNITS_GLOBAL,
    remaining: Math.max(0, DAILY_UNITS_PER_IDENTITY - mine.u),
  }
}

export class QuotaError extends Error {
  status = 429
  constructor(message: string) {
    super(message)
    this.name = "QuotaError"
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
): QuotaSnapshot {
  const units = STEP_COST[step] ?? 1
  const snap = getQuota(db, identity, now)

  if (snap.globalUsed + units > snap.globalLimit) {
    throw new QuotaError("今日全站生成额度已用完，请明天再来")
  }
  if (snap.used + units > snap.limit) {
    throw new QuotaError(
      `今日额度已用完（已用 ${snap.used}/${snap.limit}）。明天恢复，或自建实例使用自己的 API Key`,
    )
  }

  db.prepare(
    "INSERT INTO usage_log (identity, step, units, day, created_at) VALUES (?, ?, ?, ?, ?)",
  ).run(identity, step, units, todayKey(now), now)

  return getQuota(db, identity, now)
}

/**
 * 从请求里取匿名身份。
 *
 * 优先用反代透传的真实 IP（Nginx 会给 X-Forwarded-For），没有则退回
 * 几个常见的头，最后兜底一个常量——开发环境全算同一个人。
 */
export function identityFromRequest(req: Request): string {
  const get = (name: string) => req.headers.get(name)?.split(",")[0]?.trim() || ""
  const ip = get("x-forwarded-for") || get("x-real-ip") || get("cf-connecting-ip")
  return ip || "local"
}

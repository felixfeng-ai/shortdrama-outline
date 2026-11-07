import type { DatabaseSync } from "node:sqlite"

import {
  claimGenerationTask,
  failGenerationTask,
  listQueuedImageTasks,
  requeueGenerationTask,
  type GenerationTask,
} from "./repo.ts"
import { runQueuedImageTask } from "./image-runner.ts"

interface ImageQueueGlobal {
  timer: NodeJS.Timeout | null
  ticking: boolean
  recovered: WeakSet<DatabaseSync>
}

type ImageQueueRunner = (db: DatabaseSync, task: GenerationTask) => Promise<unknown>

const globalKey = "__chengjuImageQueue"
const queueGlobal: ImageQueueGlobal = (
  globalThis as typeof globalThis & { [globalKey]?: ImageQueueGlobal }
)[globalKey] ??= {
  timer: null,
  ticking: false,
  recovered: new WeakSet(),
}

function queueConcurrency(env: Record<string, string | undefined> = process.env): number {
  const value = Number(env.IMAGE_QUEUE_CONCURRENCY)
  return Number.isSafeInteger(value) && value > 0 ? Math.min(8, value) : 2
}

function modelConcurrency(env: Record<string, string | undefined> = process.env): Record<string, number> {
  try {
    const parsed = JSON.parse(env.IMAGE_MODEL_CONCURRENCY_JSON ?? "{}") as unknown
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {}
    return Object.fromEntries(
      Object.entries(parsed)
        .filter(([key, value]) => key && Number.isSafeInteger(value) && Number(value) > 0)
        .map(([key, value]) => [key, Math.min(8, Number(value))]),
    )
  } catch {
    return {}
  }
}

function retrySettings(error: unknown): { retryable: boolean; retryAfterSeconds?: number } {
  const value = error as {
    status?: number
    retryAfterSeconds?: number
    message?: string
  } | null
  const message = typeof value?.message === "string" ? value.message : String(error ?? "")
  const retryAfterSeconds = Number(value?.retryAfterSeconds)
  const retryable = value?.status === 429
    || (typeof value?.status === "number" && value.status >= 500)
    || /429|频繁|限流|超时|timeout|连接失败|请求失败|暂时|could not|network/i.test(message)
  return {
    retryable,
    ...(Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
      ? { retryAfterSeconds: Math.ceil(retryAfterSeconds) }
      : {}),
  }
}

function recoverInterruptedTasks(db: DatabaseSync): void {
  if (queueGlobal.recovered.has(db)) return
  queueGlobal.recovered.add(db)
  db.prepare(
    `UPDATE generation_tasks
     SET status = 'queued',
         started_at = NULL,
         next_poll_at = ?,
         error = '服务重启后已重新排队'
     WHERE media_kind = 'image'
       AND status = 'running'
       AND batch_id IS NOT NULL`,
  ).run(Date.now())
}

/**
 * 执行一轮队列。测试可注入 runner；生产默认调用真实现有图像生成器。
 * 一个 tick 内最多启动全局并发数量的任务，下次 tick 再补充空位。
 */
export async function runImageQueueTick(
  db: DatabaseSync,
  options: {
    runner?: ImageQueueRunner
    concurrency?: number
    modelConcurrency?: Record<string, number>
    now?: number
  } = {},
): Promise<number> {
  if (queueGlobal.ticking) return 0
  queueGlobal.ticking = true
  recoverInterruptedTasks(db)
  try {
    const concurrency = Math.max(1, options.concurrency ?? queueConcurrency())
    const modelLimits = options.modelConcurrency ?? modelConcurrency()
    const now = options.now ?? Date.now()
    const queued = listQueuedImageTasks(db, {
      now,
      limit: Math.max(concurrency * 4, 20),
    })
    const runner = options.runner ?? runQueuedImageTask
    const claimed: GenerationTask[] = []
    const modelCounts = new Map<string, number>()
    for (const task of queued) {
      if (claimed.length >= concurrency) break
      const model = task.model || "auto"
      const limit = modelLimits[model] ?? concurrency
      const current = modelCounts.get(model) ?? 0
      if (current >= limit) continue
      try {
        claimed.push(claimGenerationTask(db, task.id))
        modelCounts.set(model, current + 1)
      } catch {
        // Another request/process may have claimed it between selection and update.
      }
    }

    await Promise.all(claimed.map(async (task) => {
      try {
        await runner(db, task)
      } catch (error) {
        const retry = retrySettings(error)
        const attempt = task.attempt ?? 1
        const maxAttempts = Math.max(1, task.maxAttempts ?? 3)
        if (retry.retryable && attempt < maxAttempts) {
          const fallbackSeconds = [2, 5, 15, 30][Math.min(3, attempt - 1)]
          const delaySeconds = retry.retryAfterSeconds ?? fallbackSeconds
          requeueGenerationTask(db, task.id, {
            error: error instanceof Error ? error.message : "图像生成暂时失败",
            nextAttemptAt: Date.now() + delaySeconds * 1_000,
            attempt: attempt + 1,
          })
        } else {
          failGenerationTask(
            db,
            task.id,
            error instanceof Error ? error.message : "图像生成失败，请重试",
          )
        }
      }
    }))
    return claimed.length
  } finally {
    queueGlobal.ticking = false
  }
}

export function ensureImageQueueWorker(db: DatabaseSync): void {
  if (queueGlobal.timer) return
  const tick = () => {
    void runImageQueueTick(db)
      .catch(() => undefined)
      .finally(() => {
        queueGlobal.timer = setTimeout(tick, 1_000)
        queueGlobal.timer.unref?.()
      })
  }
  queueGlobal.timer = setTimeout(tick, 0)
  queueGlobal.timer.unref?.()
}

export function stopImageQueueWorkerForTests(): void {
  if (queueGlobal.timer) clearTimeout(queueGlobal.timer)
  queueGlobal.timer = null
  queueGlobal.ticking = false
}

import type { ImageAspect } from "./model.ts"
import type { GeneratedAsset, GenerationTargetType } from "./types.ts"

export interface BatchGenerationTarget {
  key: string
  targetType: GenerationTargetType
  targetId: string
  name: string
  detail: string
  prompt: string
  aspect: ImageAspect
  /** 明确的前置条件缺失，例如地点还没有视觉锚点。 */
  blockedReason?: string | null
  /** 不阻止生成，但需要让用户知道一致性会变弱。 */
  warning?: string | null
}

export type BatchGenerationStatus = "waiting" | "running" | "succeeded" | "failed" | "canceled"

export interface BatchGenerationOutcome {
  key: string
  status: Exclude<BatchGenerationStatus, "waiting" | "running">
  asset?: GeneratedAsset
  error?: string
}

export interface BatchDurationEstimate {
  waves: number
  minSeconds: number
  maxSeconds: number
  label: string
}

export function isBatchTargetReady(target: BatchGenerationTarget): boolean {
  return Boolean(target.prompt.trim()) && !target.blockedReason?.trim()
}

export function eligibleBatchTargets(targets: BatchGenerationTarget[]): BatchGenerationTarget[] {
  return targets.filter(isBatchTargetReady)
}

export function estimateBatchDuration(count: number, concurrency = 2): BatchDurationEstimate {
  const total = Math.max(0, Math.floor(count))
  if (total === 0) {
    return { waves: 0, minSeconds: 0, maxSeconds: 0, label: "无需排队" }
  }
  const lanes = Math.max(1, Math.floor(concurrency))
  const waves = Math.ceil(total / lanes)
  // 不把服务端排队时间说成精确耗时，只给可控的客户端等待范围。
  const minSeconds = waves * 30
  const maxSeconds = waves * 75
  const minMinutes = Math.max(1, Math.round(minSeconds / 60))
  const maxMinutes = Math.max(minMinutes, Math.round(maxSeconds / 60))
  const duration = minMinutes === maxMinutes
    ? `约 ${minMinutes} 分钟`
    : `约 ${minMinutes}–${maxMinutes} 分钟`
  return {
    waves,
    minSeconds,
    maxSeconds,
    label: `${duration}，实际取决于服务队列`,
  }
}

export async function runBatchGeneration(
  targets: BatchGenerationTarget[],
  options: {
    concurrency?: number
    signal?: AbortSignal
    run: (target: BatchGenerationTarget, signal?: AbortSignal) => Promise<GeneratedAsset>
    onProgress?: (
      target: BatchGenerationTarget,
      status: BatchGenerationStatus,
      detail?: { asset?: GeneratedAsset; error?: string },
    ) => void
  },
): Promise<BatchGenerationOutcome[]> {
  const concurrency = Math.min(targets.length || 1, Math.max(1, Math.floor(options.concurrency ?? 2)))
  const outcomes: BatchGenerationOutcome[] = new Array(targets.length)
  let cursor = 0

  async function worker() {
    while (true) {
      const index = cursor
      cursor += 1
      if (index >= targets.length) return
      const target = targets[index]

      if (options.signal?.aborted) {
        outcomes[index] = { key: target.key, status: "canceled", error: "已停止排队" }
        options.onProgress?.(target, "canceled", { error: "已停止排队" })
        continue
      }

      options.onProgress?.(target, "running")
      try {
        const asset = await options.run(target, options.signal)
        outcomes[index] = { key: target.key, status: "succeeded", asset }
        options.onProgress?.(target, "succeeded", { asset })
      } catch (cause) {
        const canceled = Boolean(options.signal?.aborted) ||
          (cause instanceof Error && cause.name === "AbortError")
        const error = cause instanceof Error ? cause.message : "生成失败，请重试"
        outcomes[index] = canceled
          ? { key: target.key, status: "canceled", error: "已停止等待" }
          : { key: target.key, status: "failed", error }
        options.onProgress?.(target, outcomes[index].status, { error })
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()))
  return outcomes
}

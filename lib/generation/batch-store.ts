import { generateKeyframe, selectKeyframe } from "./client.ts"
import {
  runBatchGeneration,
  type BatchGenerationStatus,
  type BatchGenerationTarget,
} from "./batch.ts"
import type { GeneratedAsset } from "./types.ts"
import type { LookBook } from "../look.ts"

export interface BatchRunState {
  running: boolean
  stopping: boolean
  selectedKeys: string[]
  statuses: Record<string, BatchGenerationStatus>
  errors: Record<string, string>
  assets: Record<string, GeneratedAsset>
  adoptedKeys: string[]
  busyKey: string | null
  adoptingAll: boolean
  error: string | null
  notice: string | null
}

export type BatchRunner = (
  target: BatchGenerationTarget,
  signal?: AbortSignal,
) => Promise<GeneratedAsset>

interface BatchStoreDeps {
  selectAsset?: (projectId: string, assetId: string) => Promise<GeneratedAsset>
  notify?: (item: BatchGenerationTarget) => void
}

export const EMPTY_BATCH_RUN_STATE: BatchRunState = Object.freeze({
  running: false,
  stopping: false,
  selectedKeys: [],
  statuses: {},
  errors: {},
  assets: {},
  adoptedKeys: [],
  busyKey: null,
  adoptingAll: false,
  error: null,
  notice: null,
})

function notifyTarget(item: BatchGenerationTarget) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("chengju:generation-updated", {
      detail: { targetType: item.targetType, targetId: item.targetId },
    }))
  }
}

export function createBatchRunStore(deps: BatchStoreDeps = {}) {
  const states = new Map<string, BatchRunState>()
  const listeners = new Map<string, Set<() => void>>()
  const controllers = new Map<string, AbortController>()
  const selectAsset = deps.selectAsset ?? selectKeyframe
  const notify = deps.notify ?? notifyTarget

  const getSnapshot = (key: string): BatchRunState => states.get(key) ?? EMPTY_BATCH_RUN_STATE

  function emit(key: string) {
    for (const listener of listeners.get(key) ?? []) listener()
  }

  function update(key: string, updater: (current: BatchRunState) => BatchRunState) {
    const next = updater(getSnapshot(key))
    states.set(key, next)
    emit(key)
  }

  function subscribe(key: string, listener: () => void): () => void {
    const bucket = listeners.get(key) ?? new Set<() => void>()
    bucket.add(listener)
    listeners.set(key, bucket)
    return () => {
      bucket.delete(listener)
      if (bucket.size === 0) listeners.delete(key)
    }
  }

  async function start(
    key: string,
    input: {
      projectId: string
      targets: BatchGenerationTarget[]
      look: LookBook
      runner?: BatchRunner
    },
  ): Promise<void> {
    const current = getSnapshot(key)
    if (current.running || input.targets.length === 0) return
    const controller = new AbortController()
    controllers.set(key, controller)
    update(key, () => ({
      running: true,
      stopping: false,
      selectedKeys: input.targets.map((item) => item.key),
      statuses: Object.fromEntries(input.targets.map((item) => [item.key, "waiting"])) as Record<string, BatchGenerationStatus>,
      errors: {},
      assets: {},
      adoptedKeys: [],
      busyKey: null,
      adoptingAll: false,
      error: null,
      notice: null,
    }))

    const runner = input.runner ?? ((item, signal) => generateKeyframe({
      projectId: input.projectId,
      targetType: item.targetType,
      targetId: item.targetId,
      prompt: item.prompt.trim(),
      aspect: item.aspect,
      look: input.look,
      autoSelect: false,
    }, signal).then((result) => result.asset))

    try {
      const outcomes = await runBatchGeneration(input.targets, {
        concurrency: 2,
        signal: controller.signal,
        run: async (item, signal) => {
          const asset = await runner(item, signal)
          notify(item)
          return asset
        },
        onProgress: (item, status, detail) => {
          update(key, (state) => ({
            ...state,
            statuses: { ...state.statuses, [item.key]: status },
            errors: detail?.error
              ? { ...state.errors, [item.key]: detail.error }
              : state.errors,
            assets: detail?.asset
              ? { ...state.assets, [item.key]: detail.asset }
              : state.assets,
          }))
        },
      })
      const succeeded = outcomes.filter((item) => item.status === "succeeded").length
      const failed = outcomes.filter((item) => item.status === "failed").length
      const canceled = outcomes.filter((item) => item.status === "canceled").length
      update(key, (state) => ({
        ...state,
        notice: canceled > 0
          ? `已停止等待。已完成 ${succeeded} 项，另有 ${canceled} 项停止排队；已提交任务可能仍会完成。`
          : `本批完成 ${succeeded} 项${failed > 0 ? `，${failed} 项失败可单独重试` : ""}。结果只保存为候选。`,
      }))
    } catch (cause) {
      update(key, (state) => ({
        ...state,
        error: cause instanceof Error ? cause.message : "批量生成失败，请重试",
      }))
    } finally {
      if (controllers.get(key) === controller) controllers.delete(key)
      update(key, (state) => ({ ...state, running: false, stopping: false }))
    }
  }

  function stop(key: string) {
    const controller = controllers.get(key)
    if (!controller || controller.signal.aborted) return
    update(key, (state) => ({ ...state, stopping: true }))
    controller.abort()
  }

  async function adoptCandidate(
    key: string,
    projectId: string,
    item: BatchGenerationTarget,
  ): Promise<void> {
    const state = getSnapshot(key)
    const candidate = state.assets[item.key]
    if (!candidate || state.busyKey) return
    update(key, (current) => ({ ...current, busyKey: item.key, error: null }))
    try {
      await selectAsset(projectId, candidate.id)
      update(key, (current) => ({
        ...current,
        adoptedKeys: [...new Set([...current.adoptedKeys, item.key])],
        notice: `已采用「${item.name}」的新版本`,
      }))
      notify(item)
    } catch (cause) {
      update(key, (current) => ({
        ...current,
        error: cause instanceof Error ? cause.message : "采用失败，请重试",
      }))
    } finally {
      update(key, (current) => ({ ...current, busyKey: null }))
    }
  }

  async function adoptAll(
    key: string,
    projectId: string,
    targets: BatchGenerationTarget[],
  ): Promise<void> {
    const state = getSnapshot(key)
    if (state.adoptingAll) return
    const adopted = new Set(state.adoptedKeys)
    const pending = targets.filter(
      (item) => state.statuses[item.key] === "succeeded" && !adopted.has(item.key) && state.assets[item.key],
    )
    if (pending.length === 0) return
    update(key, (current) => ({ ...current, adoptingAll: true, error: null }))
    try {
      for (const item of pending) {
        await selectAsset(projectId, state.assets[item.key].id)
        adopted.add(item.key)
        update(key, (current) => ({
          ...current,
          adoptedKeys: [...adopted],
        }))
        notify(item)
      }
      update(key, (current) => ({ ...current, notice: `已采用 ${pending.length} 张候选图` }))
    } catch (cause) {
      update(key, (current) => ({
        ...current,
        error: cause instanceof Error ? cause.message : "批量采用失败，请重试",
      }))
    } finally {
      update(key, (current) => ({ ...current, adoptingAll: false }))
    }
  }

  return {
    getSnapshot,
    subscribe,
    start,
    stop,
    adoptCandidate,
    adoptAll,
  }
}

export const batchRunStore = createBatchRunStore()

import {
  createImageGenerationBatch,
  fetchImageGenerationBatch,
  generateKeyframe,
  selectKeyframe,
  updateImageGenerationBatch,
  type ImageBatchState,
} from "./client.ts"
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
  paused: boolean
  batchId: string | null
  queuePosition: number
  estimatedSeconds: number
  selectedKeys: string[]
  statuses: Record<string, BatchGenerationStatus>
  errors: Record<string, string>
  assets: Record<string, GeneratedAsset>
  adoptedKeys: string[]
  busyKey: string | null
  adoptingAll: boolean
  error: string | null
  notice: string | null
  rateLimitResetAt: number | null
}

export type BatchRunner = (
  target: BatchGenerationTarget,
  signal?: AbortSignal,
) => Promise<GeneratedAsset>

interface BatchStoreDeps {
  selectAsset?: (projectId: string, assetId: string) => Promise<GeneratedAsset>
  notify?: (item: BatchGenerationTarget) => void
  createBatch?: typeof createImageGenerationBatch
  fetchBatch?: typeof fetchImageGenerationBatch
  updateBatch?: typeof updateImageGenerationBatch
}

export const EMPTY_BATCH_RUN_STATE: BatchRunState = Object.freeze({
  running: false,
  stopping: false,
  paused: false,
  batchId: null,
  queuePosition: 0,
  estimatedSeconds: 0,
  selectedKeys: [],
  statuses: {},
  errors: {},
  assets: {},
  adoptedKeys: [],
  busyKey: null,
  adoptingAll: false,
  error: null,
  notice: null,
  rateLimitResetAt: null,
})

function notifyTarget(item: BatchGenerationTarget) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("chengju:generation-updated", {
      detail: { targetType: item.targetType, targetId: item.targetId },
    }))
  }
}

const BATCH_STORAGE_PREFIX = "chengju:image-batch:"

function storedBatchKey(key: string): string {
  return `${BATCH_STORAGE_PREFIX}${key}`
}

function rememberBatchId(key: string, batchId: string): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(storedBatchKey(key), batchId)
  } catch {
    // 隐私模式无法持久化时，本页仍可继续轮询当前批次。
  }
}

function recallBatchId(key: string): string | null {
  if (typeof window === "undefined") return null
  try {
    return window.localStorage.getItem(storedBatchKey(key))
  } catch {
    return null
  }
}

function statusFromServer(status: ImageBatchState["items"][number]["status"]): BatchGenerationStatus {
  if (status === "queued") return "waiting"
  if (status === "running") return "running"
  if (status === "succeeded") return "succeeded"
  if (status === "failed") return "failed"
  return "canceled"
}

function isBatchTerminal(state: ImageBatchState): boolean {
  return state.batch.status === "completed"
    || state.batch.status === "stopped"
    || state.batch.status === "failed"
}

function mergeServerBatch(state: BatchRunState, remote: ImageBatchState): BatchRunState {
  const statuses: Record<string, BatchGenerationStatus> = {}
  const errors: Record<string, string> = {}
  const assets: Record<string, GeneratedAsset> = {}
  for (const item of remote.items) {
    statuses[item.key] = statusFromServer(item.status)
    if (item.error) errors[item.key] = item.error
    if (item.asset) assets[item.key] = item.asset
  }

  const active = remote.counts.queued + remote.counts.running > 0
  const finished = isBatchTerminal(remote)
  return {
    ...state,
    running: active && remote.batch.pausedAt === null,
    stopping: false,
    paused: remote.batch.pausedAt !== null,
    batchId: remote.batch.id,
    queuePosition: remote.queuePosition,
    estimatedSeconds: remote.estimatedSeconds,
    selectedKeys: remote.items.map((item) => item.key),
    statuses,
    errors,
    assets,
    notice: finished
      ? `本批完成 ${remote.counts.succeeded} 项${remote.counts.failed > 0 ? `，${remote.counts.failed} 项失败可重试` : ""}。结果只保存为候选。`
      : remote.batch.pausedAt !== null
        ? "批次已暂停，已完成结果不会丢失。"
        : state.notice,
  }
}

export function createBatchRunStore(deps: BatchStoreDeps = {}) {
  const states = new Map<string, BatchRunState>()
  const listeners = new Map<string, Set<() => void>>()
  const controllers = new Map<string, AbortController>()
  const selectAsset = deps.selectAsset ?? selectKeyframe
  const notify = deps.notify ?? notifyTarget
  const createBatch = deps.createBatch ?? createImageGenerationBatch
  const fetchBatch = deps.fetchBatch ?? fetchImageGenerationBatch
  const updateBatch = deps.updateBatch ?? updateImageGenerationBatch

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

  /** 轮询服务端批次是跨页面恢复的唯一进度来源。 */
  async function pollImageBatch(
    key: string,
    projectId: string,
    batchId: string,
    controller: AbortController,
  ): Promise<void> {
    while (!controller.signal.aborted) {
      const remote = await fetchBatch(projectId, batchId)
      update(key, (state) => mergeServerBatch(state, remote))
      if (isBatchTerminal(remote) || remote.batch.pausedAt !== null) return
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, 1_500)
      })
    }
  }

  async function start(
    key: string,
    input: {
      projectId: string
      targets: BatchGenerationTarget[]
      look: LookBook
      runner?: BatchRunner
      priority?: number
    },
  ): Promise<void> {
    const current = getSnapshot(key)
    if (current.running || input.targets.length === 0) return
    const controller = new AbortController()
    controllers.set(key, controller)
    update(key, () => ({
      running: true,
      stopping: false,
      paused: false,
      batchId: null,
      queuePosition: 0,
      estimatedSeconds: 0,
      selectedKeys: input.targets.map((item) => item.key),
      statuses: Object.fromEntries(input.targets.map((item) => [item.key, "waiting"])) as Record<string, BatchGenerationStatus>,
      errors: {},
      assets: {},
      adoptedKeys: [],
      busyKey: null,
      adoptingAll: false,
      error: null,
      notice: null,
      rateLimitResetAt: null,
    }))

    // 未注入 runner 时走持久化服务端队列；runner 仅保留给旧测试和离线预览。
    if (!input.runner) {
      try {
        const remote = await createBatch({
          projectId: input.projectId,
          targets: input.targets.map((item) => ({
            key: item.key,
            name: item.name,
            targetType: item.targetType,
            targetId: item.targetId,
            prompt: item.prompt,
            aspect: item.aspect,
          })),
          look: input.look,
          idempotencyKey: `${key}:${Date.now()}`,
          priority: input.priority ?? 0,
          concurrency: 2,
        })
        rememberBatchId(key, remote.batch.id)
        update(key, (state) => mergeServerBatch(state, remote))
        await pollImageBatch(key, input.projectId, remote.batch.id, controller)
      } catch (cause) {
        if (controller.signal.aborted) {
          update(key, (state) => ({
            ...state,
            notice: "已取消批次，已提交任务可能仍会完成。",
          }))
        } else {
          update(key, (state) => ({
            ...state,
            error: cause instanceof Error ? cause.message : "批量生成失败，请重试",
          }))
        }
      } finally {
        if (controllers.get(key) === controller) controllers.delete(key)
        update(key, (state) => ({ ...state, running: false, stopping: false }))
      }
      return
    }

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
            rateLimitResetAt: detail?.retryAfterSeconds
              ? Date.now() + detail.retryAfterSeconds * 1_000
              : state.rateLimitResetAt,
          }))
        },
      })
      const succeeded = outcomes.filter((item) => item.status === "succeeded").length
      const failed = outcomes.filter((item) => item.status === "failed").length
      const canceled = outcomes.filter((item) => item.status === "canceled").length
      const rateLimited = outcomes.find((item) => item.retryAfterSeconds)
      update(key, (state) => ({
        ...state,
        notice: rateLimited
          ? `本轮生图额度已用完，剩余队列已暂停。已完成 ${succeeded} 项，约 ${rateLimited.retryAfterSeconds} 秒后恢复。`
          : canceled > 0
          ? `已停止等待。已完成 ${succeeded} 项，另有 ${canceled} 项停止排队；已提交任务可能仍会完成。`
          : `本批完成 ${succeeded} 项${failed > 0 ? `，${failed} 项失败可单独重试` : ""}。结果只保存为候选。`,
        rateLimitResetAt: rateLimited?.retryAfterSeconds
          ? Date.now() + rateLimited.retryAfterSeconds * 1_000
          : state.rateLimitResetAt,
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

  async function stop(key: string): Promise<void> {
    const state = getSnapshot(key)
    if (!state.running || state.stopping) return
    update(key, (current) => ({ ...current, stopping: true }))

    const controller = controllers.get(key)
    if (controller) {
      controller.abort()
      return
    }
    if (!state.batchId) return
    try {
      const projectId = key.split(":")[0]
      const remote = await updateBatch(projectId, state.batchId, "cancel")
      update(key, (current) => mergeServerBatch(current, remote))
    } catch (cause) {
      update(key, (current) => ({
        ...current,
        stopping: false,
        error: cause instanceof Error ? cause.message : "取消批次失败，请重试",
      }))
    }
  }

  async function pause(key: string, projectId: string): Promise<void> {
    const state = getSnapshot(key)
    if (!state.batchId || state.paused) return
    try {
      const remote = await updateBatch(projectId, state.batchId, "pause")
      update(key, (current) => mergeServerBatch(current, remote))
    } catch (cause) {
      update(key, (current) => ({
        ...current,
        error: cause instanceof Error ? cause.message : "暂停批次失败，请重试",
      }))
    }
  }

  async function resume(key: string, projectId: string): Promise<void> {
    const state = getSnapshot(key)
    if (!state.batchId || !state.paused) return
    const controller = new AbortController()
    controllers.set(key, controller)
    update(key, (current) => ({
      ...current,
      running: true,
      paused: false,
      stopping: false,
      error: null,
    }))
    try {
      const remote = await updateBatch(projectId, state.batchId, "resume")
      update(key, (current) => mergeServerBatch(current, remote))
      await pollImageBatch(key, projectId, state.batchId, controller)
    } catch (cause) {
      update(key, (current) => ({
        ...current,
        running: false,
        error: cause instanceof Error ? cause.message : "恢复批次失败，请重试",
      }))
    } finally {
      if (controllers.get(key) === controller) controllers.delete(key)
      update(key, (current) => ({ ...current, running: false, stopping: false }))
    }
  }

  async function retryFailed(key: string, projectId: string): Promise<void> {
    const state = getSnapshot(key)
    if (!state.batchId || state.running) return
    try {
      const remote = await updateBatch(projectId, state.batchId, "retry-failed")
      update(key, (current) => mergeServerBatch(current, remote))
      const controller = new AbortController()
      controllers.set(key, controller)
      await pollImageBatch(key, projectId, state.batchId, controller)
    } catch (cause) {
      update(key, (current) => ({
        ...current,
        error: cause instanceof Error ? cause.message : "重试失败项失败，请重试",
      }))
    } finally {
      const controller = controllers.get(key)
      if (controller && !controller.signal.aborted) controller.abort()
      controllers.delete(key)
      update(key, (current) => ({ ...current, running: false, stopping: false }))
    }
  }

  async function retryTask(
    key: string,
    projectId: string,
    targetKey: string,
  ): Promise<void> {
    const state = getSnapshot(key)
    if (!state.batchId || state.running) return
    try {
      const remote = await updateBatch(projectId, state.batchId, "retry-task", { targetKey })
      update(key, (current) => mergeServerBatch(current, remote))
      const controller = new AbortController()
      controllers.set(key, controller)
      update(key, (current) => ({ ...current, running: true, error: null }))
      await pollImageBatch(key, projectId, state.batchId, controller)
    } catch (cause) {
      update(key, (current) => ({
        ...current,
        running: false,
        error: cause instanceof Error ? cause.message : "重试失败项失败，请重试",
      }))
    } finally {
      const controller = controllers.get(key)
      if (controller && !controller.signal.aborted) controller.abort()
      controllers.delete(key)
    }
  }

  /** 页面重新挂载时读取本地批次 id，再向服务端恢复真实进度。 */
  async function hydrate(key: string, projectId: string): Promise<void> {
    const current = getSnapshot(key)
    if (current.running || current.batchId) return
    const batchId = recallBatchId(key)
    if (!batchId) return
    try {
      const remote = await fetchBatch(projectId, batchId)
      update(key, (state) => mergeServerBatch(state, remote))
      if (!isBatchTerminal(remote) && remote.batch.pausedAt === null) {
        const controller = new AbortController()
        controllers.set(key, controller)
        void pollImageBatch(key, projectId, batchId, controller).finally(() => {
          if (controllers.get(key) === controller) controllers.delete(key)
          update(key, (state) => ({ ...state, running: false, stopping: false }))
        })
      }
    } catch {
      // 批次被清理或不属于当前项目时，静默回到空状态。
    }
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
    pause,
    resume,
    retryFailed,
    retryTask,
    hydrate,
    adoptCandidate,
    adoptAll,
  }
}

export const batchRunStore = createBatchRunStore()

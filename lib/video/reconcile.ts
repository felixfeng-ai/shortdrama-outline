import type { DatabaseSync } from "node:sqlite"

import { writeGeneratedVideo } from "../generation/files.ts"
import {
  cancelGenerationTask,
  completeGenerationTask,
  failGenerationTask,
  listGenerationTasks,
  markGenerationTaskRunning,
  saveGeneratedAsset,
  selectGeneratedAsset,
  updateGenerationProviderStatus,
} from "../generation/repo.ts"
import { notifyGenerationFinished } from "../push/service.ts"
import { publicVideoGenerationError } from "./model.ts"
import {
  downloadMiniMaxVideo,
  queryMiniMaxVideo,
} from "./service.ts"

/**
 * 视频任务可能在本机页面关闭后继续运行，因此“读取状态”本身也承担对账职责。
 * 所有移动端入口必须先对账再组装上下文，避免把供应商已完成的任务误报为排队中。
 */
export async function reconcileProjectVideoTasks(
  db: DatabaseSync,
  projectId: string,
  ownerId: string,
): Promise<void> {
  const now = Date.now()
  const tasks = listGenerationTasks(db, projectId, undefined, undefined, "video")
    .filter((task) =>
      (task.status === "queued" || task.status === "running")
      && Boolean(task.providerTaskId)
      && (task.nextPollAt ?? 0) <= now
    )
    .slice(0, 6)

  for (const task of tasks) {
    try {
      const state = await queryMiniMaxVideo(task.providerTaskId!)
      if (state.status === "queued" || state.status === "running") {
        if (state.status === "running") markGenerationTaskRunning(db, task.id)
        updateGenerationProviderStatus(db, task.id, {
          providerStatus: state.status,
          nextPollAt: Date.now() + 5_000,
        })
        continue
      }
      if (state.status === "canceled") {
        updateGenerationProviderStatus(db, task.id, {
          providerStatus: state.status,
          nextPollAt: Date.now() + 60_000,
        })
        cancelGenerationTask(db, task.id, "供应商已取消")
        continue
      }
      if (state.status === "failed") {
        updateGenerationProviderStatus(db, task.id, {
          providerStatus: state.status,
          nextPollAt: Date.now() + 60_000,
        })
        const failed = failGenerationTask(
          db,
          task.id,
          publicVideoGenerationError(state.error),
        )
        await notifyGenerationFinished(db, ownerId, {
          taskId: task.id,
          targetType: task.targetType,
          status: "failed",
          mediaKind: "video",
          error: failed.error,
          projectId: task.projectId,
          targetId: task.targetId,
          assetId: null,
        }).catch(() => undefined)
        continue
      }
      if (state.status !== "succeeded") continue

      const video = await downloadMiniMaxVideo(state.videoUrl)
      const file = writeGeneratedVideo(
        projectId,
        `${task.id}-video`,
        video.bytes,
        video.mime,
      )
      const request = task.request ?? {}
      const sourceAssetId = typeof request.sourceAssetId === "string"
        ? request.sourceAssetId
        : null
      const requestedDuration = Number(request.duration)
      const durationMs = state.durationSeconds !== null
        ? Math.round(state.durationSeconds * 1000)
        : Number.isFinite(requestedDuration) && requestedDuration > 0
          ? Math.round(requestedDuration * 1000)
          : null
      const asset = saveGeneratedAsset(db, {
        taskId: task.id,
        projectId,
        targetType: task.targetType,
        targetId: task.targetId,
        storageKey: file.storageKey,
        mime: video.mime,
        bytes: file.bytes,
        providerId: task.providerId,
        model: task.model,
        prompt: task.prompt,
        mediaKind: "video",
        durationMs,
        width: null,
        height: null,
        fps: null,
        sha256: video.sha256,
        posterStorageKey: null,
        sourceAssetIds: sourceAssetId ? [sourceAssetId] : [],
        generationMeta: {
          providerTaskId: task.providerTaskId,
          providerStatus: state.status,
          resolution: state.resolution,
          ratio: state.ratio,
          usage: state.usage,
        },
      })
      if (request.autoSelect === true) selectGeneratedAsset(db, projectId, asset.id)
      updateGenerationProviderStatus(db, task.id, {
        providerStatus: state.status,
        nextPollAt: Date.now() + 60_000,
      })
      const completed = completeGenerationTask(db, task.id, asset.id)
      await notifyGenerationFinished(db, ownerId, {
        taskId: task.id,
        targetType: task.targetType,
        status: "succeeded",
        mediaKind: "video",
        projectId: task.projectId,
        targetId: task.targetId,
        assetId: completed.assetId,
      }).catch(() => undefined)
    } catch (error) {
      updateGenerationProviderStatus(db, task.id, {
        providerStatus: "query_error",
        nextPollAt: Date.now() + 15_000,
      })
      console.warn("[video] 任务对账失败", {
        taskId: task.id,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }
}

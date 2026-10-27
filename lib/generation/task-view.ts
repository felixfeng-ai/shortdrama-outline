import type { Shot, VisualCharacter, VisualPlace } from "../assets/types.ts"
import { placeGenerationTargetId } from "../assets/anchors.ts"
import type { GenerationStatus, GenerationTask } from "./types.ts"

export interface GenerationTaskSummary {
  total: number
  counts: Record<GenerationStatus, number>
  label: string
}

export function summarizeGenerationTasks(tasks: readonly GenerationTask[]): GenerationTaskSummary {
  const counts: Record<GenerationStatus, number> = {
    queued: 0,
    running: 0,
    succeeded: 0,
    failed: 0,
    canceled: 0,
  }
  for (const task of tasks) counts[task.status] += 1

  const parts = [
    counts.running > 0 && `${counts.running} 运行`,
    counts.queued > 0 && `${counts.queued} 等待`,
    counts.failed > 0 && `${counts.failed} 失败`,
    counts.canceled > 0 && `${counts.canceled} 已停止`,
    counts.succeeded > 0 && `${counts.succeeded} 成功`,
  ].filter(Boolean)

  return {
    total: tasks.length,
    counts,
    label: parts.join(" · ") || "暂无任务",
  }
}

export function generationTaskTargetLabel(
  task: GenerationTask,
  visuals: readonly VisualCharacter[],
  shots: readonly Shot[],
  places: readonly VisualPlace[] = [],
): string {
  if (task.targetType === "character") {
    const character = visuals.find((item) => item.entityId === task.targetId || item.id === task.targetId)
    return character?.name ? `角色 · ${character.name}` : `角色 · ${task.targetId.slice(0, 8)}`
  }
  if (task.targetType === "place") {
    const place = places.find((item) =>
      item.id === task.targetId || placeGenerationTargetId(item.name) === task.targetId
    )
    return place?.name ? `地点 · ${place.name}` : `地点 · ${task.targetId.slice(0, 8)}`
  }
  const shot = shots.find((item) => item.entityId === task.targetId || item.id === task.targetId)
  if (!shot) return `镜头 · ${task.targetId.slice(0, 8)}`
  const episode = shot.episode > 0 ? `第 ${shot.episode} 集 · ` : ""
  return `${episode}第 ${shot.shot} 镜 · ${shot.scene}`
}

export function selectRetryableTasks(tasks: readonly GenerationTask[]): GenerationTask[] {
  const latestByTarget = new Map<string, GenerationTask>()
  const sorted = [...tasks].sort((a, b) => b.createdAt - a.createdAt)
  for (const task of sorted) {
    const key = `${task.targetType}:${task.targetId}`
    if (!latestByTarget.has(key)) latestByTarget.set(key, task)
  }
  return [...latestByTarget.values()].filter(
    (task) => task.status === "failed" || task.status === "canceled",
  )
}

import { NextResponse } from "next/server"

import { InputError, errorResponse, ok } from "@/lib/api"
import { getDbForRequest } from "@/lib/assets/store"
import type { ArtifactKind } from "@/lib/assets/types"
import { createProject, createSnapshot, deleteProject } from "@/lib/assets/repo"
import { resolveProjectOwner, resolveRequestIdentity } from "@/lib/auth/request"
import { parseProjectPackage } from "@/lib/export/import"
import type { ProjectPackageManifest } from "@/lib/export/package"
import { enforceApiRateLimit } from "@/lib/security/api-rate-limit"
import {
  completeGenerationTask,
  createGenerationTask,
  failGenerationTask,
  markGenerationTaskRunning,
  saveGeneratedAsset,
  selectGeneratedAsset,
} from "@/lib/generation/repo"
import { removeGeneratedProjectFiles, writeGeneratedImage } from "@/lib/generation/files"
import { sniffImageMime } from "@/lib/generation/model"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

interface ExportedSnapshot {
  id?: string
  kind: ArtifactKind
  version: number
  payload: unknown
  parents?: string[]
}

interface ExportedKeyframe {
  taskId?: string
  targetType: "character" | "place" | "shot"
  targetId: string
  providerId?: string
  model?: string
  prompt?: string
  mime?: string
  selectedAt?: number | null
  archivePath?: string
  included?: boolean
  importFile?: string
}

interface ExportedTask {
  id?: string
  targetType: "character" | "place" | "shot"
  targetId: string
  providerId?: string
  model?: string
  prompt?: string
  status?: string
  error?: string | null
}

const KIND_ORDER: ArtifactKind[] = [
  "idea",
  "characters",
  "acts",
  "episodes",
  "visualCharacters",
  "scenes",
  "visualPlaces",
  "shots",
]

function latestPayloads(manifest: ProjectPackageManifest): Record<ArtifactKind, unknown> {
  const story = manifest.story as Record<string, unknown>
  const assets = manifest.assets as Record<string, unknown>
  return {
    idea: { idea: story.idea ?? "", genre: manifest.projectSettings.genre },
    characters: story.characters ?? [],
    acts: story.acts ?? [],
    episodes: story.episodes ?? [],
    visualCharacters: assets.visuals ?? [],
    scenes: assets.scenes ?? [],
    visualPlaces: assets.places ?? [],
    shots: assets.shots ?? [],
  }
}

function restoreSnapshots(
  db: ReturnType<typeof getDbForRequest>,
  projectId: string,
  manifest: ProjectPackageManifest,
): number {
  const snapshots = manifest.snapshots as ExportedSnapshot[]
  if (manifest.mode === "backup" && Array.isArray(snapshots) && snapshots.length > 0) {
    const ordered = snapshots
      .filter((item) => item && KIND_ORDER.includes(item.kind) && Number.isFinite(item.version))
      .sort((a, b) => {
        const kind = KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind)
        return kind !== 0 ? kind : a.version - b.version
      })
    const oldToNew = new Map<string, string>()
    for (const item of ordered) {
      const parents = (item.parents ?? []).map((id) => oldToNew.get(id)).filter((id): id is string => Boolean(id))
      const created = createSnapshot(db, { projectId, kind: item.kind, payload: item.payload, parents })
      if (item.id) oldToNew.set(item.id, created.id)
    }
    return ordered.length
  }

  const latest = latestPayloads(manifest)
  for (const kind of KIND_ORDER) {
    createSnapshot(db, { projectId, kind, payload: latest[kind] })
  }
  return KIND_ORDER.length
}

async function restoreKeyframes(
  db: ReturnType<typeof getDbForRequest>,
  projectId: string,
  form: FormData,
  manifest: ProjectPackageManifest,
  taskMap: Map<string, string>,
): Promise<{ restored: number; warnings: string[] }> {
  let restored = 0
  const warnings: string[] = []
  const entries = manifest.keyframes as ExportedKeyframe[]
  for (const entry of entries) {
    if (!entry?.included || !entry.importFile) continue
    const file = form.get(entry.importFile)
    if (!file || typeof file === "string") {
      warnings.push(`${entry.archivePath || entry.importFile} 未随项目包提供`)
      continue
    }
    if (file.size <= 0 || file.size > 15 * 1024 * 1024) {
      warnings.push(`${entry.archivePath || entry.importFile} 尺寸不合法`)
      continue
    }
    const bytes = new Uint8Array(await file.arrayBuffer())
    let mime = ""
    try {
      mime = sniffImageMime(bytes)
    } catch {
      warnings.push(`${entry.archivePath || entry.importFile} 不是有效图片`)
      continue
    }
    if (entry.mime && entry.mime !== mime) {
      warnings.push(`${entry.archivePath || entry.importFile} 类型与清单不一致`)
      continue
    }
    if (!["character", "place", "shot"].includes(entry.targetType)) {
      warnings.push(`${entry.archivePath || entry.importFile} 目标类型不正确`)
      continue
    }

    const mappedTaskId = entry.taskId ? taskMap.get(entry.taskId) : null
    const task = mappedTaskId
      ? ({ id: mappedTaskId } as { id: string })
      : createGenerationTask(db, {
        projectId,
        targetType: entry.targetType,
        targetId: entry.targetId,
        providerId: entry.providerId || "imported",
        model: entry.model || "imported",
        prompt: entry.prompt || "",
      })
    markGenerationTaskRunning(db, task.id)
    const stored = writeGeneratedImage(projectId, task.id, bytes, mime)
    const asset = saveGeneratedAsset(db, {
      taskId: task.id,
      projectId,
      targetType: entry.targetType,
      targetId: entry.targetId,
      storageKey: stored.storageKey,
      mime,
      bytes: stored.bytes,
      providerId: entry.providerId || "imported",
      model: entry.model || "imported",
      prompt: entry.prompt || "",
    })
    completeGenerationTask(db, task.id, asset.id)
    if (entry.selectedAt) selectGeneratedAsset(db, projectId, asset.id)
    restored += 1
  }
  return { restored, warnings }
}

function restoreTasks(
  db: ReturnType<typeof getDbForRequest>,
  projectId: string,
  manifest: ProjectPackageManifest,
): Map<string, string> {
  const taskMap = new Map<string, string>()
  const tasks = manifest.tasks as ExportedTask[]
  for (const task of tasks) {
    if (!task || !["character", "place", "shot"].includes(task.targetType) || !task.targetId) continue
    const created = createGenerationTask(db, {
      projectId,
      targetType: task.targetType,
      targetId: task.targetId,
      providerId: task.providerId || "imported",
      model: task.model || "imported",
      prompt: task.prompt || "",
    })
    if (task.id) taskMap.set(task.id, created.id)
    if (task.status === "failed") failGenerationTask(db, created.id, task.error || "导入前任务失败")
  }
  return taskMap
}

export async function POST(req: Request) {
  const db = getDbForRequest()
  const ownerId = resolveProjectOwner(db, req)
  let projectId: string | null = null
  try {
    enforceApiRateLimit(db, req, "import", {
      identity: resolveRequestIdentity(db, req),
    })
    const form = await req.formData()
    const raw = form.get("manifest")
    if (typeof raw !== "string") throw new InputError("项目包缺少 manifest")
    let value: unknown
    try {
      value = JSON.parse(raw)
    } catch {
      throw new InputError("项目包 manifest 不是有效 JSON")
    }
    let manifest: ProjectPackageManifest
    try {
      manifest = parseProjectPackage(value)
    } catch (cause) {
      throw new InputError(cause instanceof Error ? cause.message : "项目包格式不正确")
    }
    const projectData = manifest.project as Record<string, unknown>
    const title = typeof projectData.title === "string" && projectData.title.trim()
      ? projectData.title.trim().slice(0, 100)
      : "导入项目"
    const project = createProject(db, title, ownerId)
    projectId = project.id
    const restoredSnapshots = restoreSnapshots(db, project.id, manifest)
    const taskMap = restoreTasks(db, project.id, manifest)
    const keyframes = await restoreKeyframes(db, project.id, form, manifest, taskMap)

    return NextResponse.json(ok({
      project,
      counts: {
        snapshots: restoredSnapshots,
        tasks: taskMap.size,
        keyframes: keyframes.restored,
        refs: 0,
      },
      warnings: [...manifest.warnings, ...keyframes.warnings],
    }))
  } catch (error) {
    if (projectId) {
      try {
        deleteProject(db, projectId, ownerId)
        removeGeneratedProjectFiles(projectId)
      } catch {
        // 清理失败不覆盖原始错误。
      }
    }
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}

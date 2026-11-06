import { NextResponse } from "next/server"

import { InputError, errorResponse, ok } from "@/lib/api"
import { getDbForRequest } from "@/lib/assets/store"
import type { ArtifactKind } from "@/lib/assets/types"
import { saveProjectMaterial } from "@/lib/assets/materials"
import { saveProjectContext } from "@/lib/assets/project-context"
import { createProject, createSnapshot, deleteProject } from "@/lib/assets/repo"
import { resolveProjectOwner, resolveRequestIdentity } from "@/lib/auth/request"
import { readProjectPackage, type ProjectPackageMigration } from "@/lib/export/import"
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
import {
  restoreLocalizationBackup,
  type LocalizationBackupData,
} from "@/lib/localization/backup"
import {
  createNovelEdition,
  saveNovelChapter,
  saveNovelPlan,
} from "@/lib/novels/repo"
import { buildNovelSourcePack } from "@/lib/novels/source-pack"
import type { NovelPlan, NovelPresetId } from "@/lib/novels/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

interface ExportedSnapshot {
  id?: string
  branchId?: string
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

interface ExportedMaterial {
  name?: string
  kind?: string
  mime?: string
  bytes?: number
  content?: string
}

interface ExportedNovel {
  title?: string
  preset?: NovelPresetId
  volumes?: Array<{
    title?: string
    summary?: string
    startChapter?: number
    endChapter?: number
  }>
  chapters?: Array<{
    number?: number
    title?: string
    outline?: string
    hook?: string
    targetWords?: number
    sourceEpisode?: number
    sourceSceneIds?: string[]
    content?: string
    summary?: string
  }>
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
): { count: number; snapshotMap: Map<string, string> } {
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
      const created = createSnapshot(db, {
        projectId,
        branchId: item.branchId,
        kind: item.kind,
        payload: item.payload,
        parents,
      })
      if (item.id) oldToNew.set(item.id, created.id)
    }
    return { count: ordered.length, snapshotMap: oldToNew }
  }

  const latest = latestPayloads(manifest)
  const snapshotMap = new Map<string, string>()
  for (const kind of KIND_ORDER) {
    const created = createSnapshot(db, { projectId, kind, payload: latest[kind] })
    snapshotMap.set(kind, created.id)
  }
  return { count: KIND_ORDER.length, snapshotMap }
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

function restoreMaterials(
  db: ReturnType<typeof getDbForRequest>,
  projectId: string,
  ownerId: string,
  manifest: ProjectPackageManifest,
): { restored: number; warnings: string[] } {
  const warnings: string[] = []
  const materials = Array.isArray(manifest.materials)
    ? manifest.materials as ExportedMaterial[]
    : []
  let restored = 0
  for (const material of materials) {
    const name = typeof material?.name === "string" ? material.name.trim() : ""
    const content = typeof material?.content === "string" ? material.content : ""
    if (!name || !content) {
      warnings.push("有一份项目原文缺少名称或正文，已跳过")
      continue
    }
    try {
      saveProjectMaterial(db, {
        projectId,
        ownerId,
        name,
        content,
        mime: typeof material.mime === "string" ? material.mime : "text/plain",
        bytes: typeof material.bytes === "number" ? material.bytes : undefined,
        kind: material.kind === "novel" || material.kind === "script" || material.kind === "notes"
          ? material.kind
          : undefined,
      })
      restored += 1
    } catch (error) {
      warnings.push(`${name} 恢复失败：${error instanceof Error ? error.message : "格式不正确"}`)
    }
  }
  return { restored, warnings }
}

/**
 * 完整备份中的小说稿按独立产物恢复。
 * 正文作为新项目里的已生成章节落库，不尝试伪造原始生成任务或供应商调用记录。
 */
function restoreNovels(
  db: ReturnType<typeof getDbForRequest>,
  projectId: string,
  ownerId: string,
  manifest: ProjectPackageManifest,
): { restored: number; warnings: string[] } {
  if (manifest.mode !== "backup" || !Array.isArray(manifest.novels)) {
    return { restored: 0, warnings: [] }
  }
  const warnings: string[] = []
  let restored = 0
  const sourcePack = buildNovelSourcePack(db, projectId)
  for (const raw of manifest.novels as ExportedNovel[]) {
    try {
      const sourceChapters = Array.isArray(raw?.chapters) ? raw.chapters : []
      if (sourceChapters.length === 0) continue
      const edition = createNovelEdition(db, {
        projectId,
        ownerId,
        title: raw.title?.trim() || "导入小说稿",
        preset: raw.preset || "standard",
        sourceSnapshotIds: sourcePack.sourceSnapshotIds,
        sourceSignature: sourcePack.signature,
      })
      const normalizedChapters = sourceChapters
        .map((chapter, index) => ({
          number: Math.max(1, Math.round(Number(chapter.number) || index + 1)),
          title: chapter.title?.trim() || `第 ${index + 1} 章`,
          outline: chapter.outline?.trim() || "",
          hook: chapter.hook?.trim() || "",
          targetWords: Math.max(500, Math.round(Number(chapter.targetWords) || 2_200)),
          sourceEpisode: Math.max(0, Math.round(Number(chapter.sourceEpisode) || 0)),
          sourceSceneIds: Array.isArray(chapter.sourceSceneIds)
            ? chapter.sourceSceneIds.filter((id): id is string => typeof id === "string")
            : [],
          content: chapter.content?.trim() || "",
          summary: chapter.summary?.trim() || "",
        }))
        .sort((left, right) => left.number - right.number)
      const backupVolumes = Array.isArray(raw.volumes) ? raw.volumes : []
      const volumes = backupVolumes.length > 0
        ? backupVolumes.map((volume, index) => ({
          title: volume.title?.trim() || `第 ${index + 1} 卷`,
          summary: volume.summary?.trim() || "",
          startChapter: Math.max(1, Math.round(Number(volume.startChapter) || 1)),
          endChapter: Math.max(1, Math.round(Number(volume.endChapter) || normalizedChapters.length)),
        }))
        : [{ title: "第一卷", summary: "导入备份", startChapter: 1, endChapter: normalizedChapters.length }]
      const plan: NovelPlan = {
        volumes,
        chapters: normalizedChapters,
      }
      saveNovelPlan(db, edition.id, plan)
      for (const chapter of normalizedChapters) {
        if (!chapter.content) continue
        saveNovelChapter(db, edition.id, {
          number: chapter.number,
          content: chapter.content,
          summary: chapter.summary || chapter.outline,
          sourceSignature: sourcePack.signature,
        })
      }
      restored += 1
    } catch (error) {
      warnings.push(`小说稿恢复失败：${error instanceof Error ? error.message : "格式不正确"}`)
    }
  }
  return { restored, warnings }
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
    let packageMigration: ProjectPackageMigration
    try {
      const parsed = readProjectPackage(value)
      manifest = parsed.manifest
      packageMigration = parsed.migration
    } catch (cause) {
      throw new InputError(cause instanceof Error ? cause.message : "项目包格式不正确")
    }
    const projectData = manifest.project as Record<string, unknown>
    const title = typeof projectData.title === "string" && projectData.title.trim()
      ? projectData.title.trim().slice(0, 100)
      : "导入项目"
    const project = createProject(db, title, ownerId)
    projectId = project.id
    saveProjectContext(db, project.id, ownerId, {
      brief: manifest.projectSettings.brief,
      look: manifest.projectSettings.look,
      episodeCount: manifest.projectSettings.episodeCount,
    })
    const restoredSnapshots = restoreSnapshots(db, project.id, manifest)
    const localization = restoreLocalizationBackup(
      db,
      project.id,
      ownerId,
      manifest.localization as LocalizationBackupData | undefined,
      {
        sourceSnapshotId: restoredSnapshots.snapshotMap.get("episodes")
          ?? restoredSnapshots.snapshotMap.values().next().value,
        sourceSnapshotMap: restoredSnapshots.snapshotMap,
      },
    )
    const taskMap = restoreTasks(db, project.id, manifest)
    const keyframes = await restoreKeyframes(db, project.id, form, manifest, taskMap)
    const materials = restoreMaterials(db, project.id, ownerId, manifest)
    const novels = restoreNovels(db, project.id, ownerId, manifest)

    return NextResponse.json(ok({
      project,
      counts: {
        snapshots: restoredSnapshots.count + localization.snapshots,
        tasks: taskMap.size,
        keyframes: keyframes.restored,
        refs: 0,
        sources: materials.restored,
        localizationBranches: localization.branches,
        novels: novels.restored,
      },
      packageMigration,
      warnings: [...manifest.warnings, ...keyframes.warnings, ...materials.warnings, ...novels.warnings],
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

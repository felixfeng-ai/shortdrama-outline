import type { GeneratedAsset } from "../generation/types.ts"
import type { CreativeBrief } from "../brief.ts"
import type { JudgmentEntry } from "../judgment-log.ts"
import type { LookBook } from "../look.ts"

export const PROJECT_PACKAGE_SCHEMA = "chengju.project" as const
export const PROJECT_PACKAGE_SCHEMA_VERSION = 2 as const
export const EXPORT_REPORT_SCHEMA = "chengju.export-report" as const

export type ProjectExportMode = "delivery" | "backup"

export interface ProjectPackageSettings {
  genre: string
  episodeCount: number
  brief: CreativeBrief
  look: LookBook
  judgments: JudgmentEntry[]
}

export interface ProjectExportFile {
  path: string
  kind: string
  bytes: number
}

export interface ProjectExportMissing {
  kind: string
  label: string
  path: string
  reason: string
}

export interface ProjectExportReport {
  schema: typeof EXPORT_REPORT_SCHEMA
  schemaVersion: 1
  mode: ProjectExportMode
  exportedAt: number
  summary: string
  files: ProjectExportFile[]
  missing: ProjectExportMissing[]
  warnings: string[]
}

export interface ProjectPackageManifest<
  TProject = unknown,
  TStory = unknown,
  TAssets = unknown,
  TRef = unknown,
  TKeyframe = unknown,
  TTask = unknown,
  TSnapshot = unknown,
> {
  schema: typeof PROJECT_PACKAGE_SCHEMA
  schemaVersion: typeof PROJECT_PACKAGE_SCHEMA_VERSION
  mode: ProjectExportMode
  project: TProject
  exportedAt: number
  projectSettings: ProjectPackageSettings
  story: TStory
  assets: TAssets
  refs: TRef[]
  keyframes: TKeyframe[]
  tasks: TTask[]
  snapshots: TSnapshot[]
  files: ProjectExportFile[]
  reportPath: "export-report.json"
  warnings: string[]
}

export function buildProjectPackageManifest<
  TProject,
  TStory,
  TAssets,
  TRef,
  TKeyframe = unknown,
  TTask = unknown,
  TSnapshot = unknown,
>(input: {
  project: TProject
  mode: ProjectExportMode
  exportedAt: number
  projectSettings: ProjectPackageSettings
  story: TStory
  assets: TAssets
  refs: TRef[]
  keyframes?: TKeyframe[]
  tasks?: TTask[]
  snapshots?: TSnapshot[]
  files?: ProjectExportFile[]
  warnings?: string[]
}): ProjectPackageManifest<TProject, TStory, TAssets, TRef, TKeyframe, TTask, TSnapshot> {
  return {
    schema: PROJECT_PACKAGE_SCHEMA,
    schemaVersion: PROJECT_PACKAGE_SCHEMA_VERSION,
    mode: input.mode,
    project: input.project,
    exportedAt: input.exportedAt,
    projectSettings: input.projectSettings,
    story: input.story,
    assets: input.assets,
    refs: input.refs,
    keyframes: input.keyframes ?? [],
    tasks: input.tasks ?? [],
    snapshots: input.snapshots ?? [],
    files: input.files ?? [],
    reportPath: "export-report.json",
    warnings: input.warnings ?? [],
  }
}

export function safePathSegment(value: unknown, fallback = "未命名"): string {
  const clean = String(value ?? "")
    .normalize("NFKC")
    .replace(/\s*[·•]\s*/g, "-")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.\-\s]+|[.\-\s]+$/g, "")
    .slice(0, 60)
  return clean || fallback
}

export function safeProjectFileStem(value: unknown): string {
  return safePathSegment(value || "未命名漫剧", "未命名漫剧").slice(0, 80)
}

export function uniqueArchivePath(path: string, used: Set<string>): string {
  if (!used.has(path)) {
    used.add(path)
    return path
  }
  const slash = path.lastIndexOf("/")
  const directory = slash >= 0 ? path.slice(0, slash + 1) : ""
  const fileName = slash >= 0 ? path.slice(slash + 1) : path
  const dot = fileName.lastIndexOf(".")
  const stem = dot > 0 ? fileName.slice(0, dot) : fileName
  const ext = dot > 0 ? fileName.slice(dot) : ""
  let index = 2
  while (true) {
    const candidate = `${directory}${stem}-${index}${ext}`
    if (!used.has(candidate)) {
      used.add(candidate)
      return candidate
    }
    index += 1
  }
}

const MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
}

export function keyframeArchivePath(
  asset: Pick<GeneratedAsset, "id" | "mime" | "createdAt" | "selectedAt" | "targetType" | "targetId">,
  input: {
    mode: ProjectExportMode
    selected: boolean
    folder: string
    label: string
  },
): string {
  const ext = MIME_EXT[asset.mime] ?? "bin"
  const folder = input.folder
    .split("/")
    .filter(Boolean)
    .map((part) => safePathSegment(part))
    .join("/")
  const label = safePathSegment(input.label, "图片")
  const base = input.selected ? "selected" : "history"
  const suffix = input.selected
    ? ""
    : `-候选-${safePathSegment(asset.id, String(asset.createdAt))}`
  return `generated/${base}/${folder}/${label}${suffix}.${ext}`
}

export function buildExportReport(input: {
  mode: ProjectExportMode
  exportedAt: number
  files: ProjectExportFile[]
  missing?: ProjectExportMissing[]
  warnings?: string[]
}): ProjectExportReport {
  const missing = input.missing ?? []
  const warnings = input.warnings ?? []
  return {
    schema: EXPORT_REPORT_SCHEMA,
    schemaVersion: 1,
    mode: input.mode,
    exportedAt: input.exportedAt,
    summary: `共 ${input.files.length} 个文件，${missing.length} 项缺失，${warnings.length} 条提醒。`,
    files: input.files,
    missing,
    warnings,
  }
}

import {
  PROJECT_PACKAGE_SCHEMA,
  PROJECT_PACKAGE_SCHEMA_VERSION,
  type ProjectPackageManifest,
} from "./package.ts"
import { buildAiExportDisclosure } from "./ai-disclosure.ts"

export const MIN_SUPPORTED_PROJECT_PACKAGE_VERSION = 2

export interface ProjectPackageMigration {
  fromVersion: number
  toVersion: typeof PROJECT_PACKAGE_SCHEMA_VERSION
  migrated: boolean
  steps: string[]
}

export interface ParsedProjectPackage {
  manifest: ProjectPackageManifest
  migration: ProjectPackageMigration
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("项目包内容格式不正确")
  }
  return value as Record<string, unknown>
}

function validateCommon(manifest: Record<string, unknown>): void {
  if (manifest.schema !== PROJECT_PACKAGE_SCHEMA) {
    throw new Error("项目包格式不正确")
  }
  if (manifest.mode !== "delivery" && manifest.mode !== "backup") {
    throw new Error("项目包导出模式不正确")
  }
  record(manifest.project)
  record(manifest.projectSettings)
  record(manifest.story)
  record(manifest.assets)
  for (const key of ["refs", "keyframes", "tasks", "snapshots"]) {
    if (!Array.isArray(manifest[key])) throw new Error(`项目包缺少 ${key}`)
  }
  if (manifest.localization !== undefined && !record(manifest.localization)) {
    throw new Error("项目包本地化数据格式不正确")
  }
}

function validateV3(manifest: Record<string, unknown>): void {
  validateCommon(manifest)
  for (const key of ["materials", "files", "warnings"]) {
    if (!Array.isArray(manifest[key])) throw new Error(`项目包缺少 ${key}`)
  }
  const ai = record(manifest.ai)
  if (ai.label !== "AI 生成" || ai.provenancePath !== "ai-provenance.json") {
    throw new Error("项目包 AI 标识格式不正确")
  }
  if (manifest.reportPath !== "export-report.json") {
    throw new Error("项目包报告路径不正确")
  }
}

function migrateV2ToV3(
  manifest: Record<string, unknown>,
): { manifest: Record<string, unknown>; steps: string[] } {
  validateCommon(manifest)
  const steps: string[] = []
  const next: Record<string, unknown> = { ...manifest, schemaVersion: 3 }

  if (!Array.isArray(next.materials)) {
    next.materials = []
    steps.push("补齐项目原文数组")
  }
  if (!Array.isArray(next.files)) {
    next.files = []
    steps.push("补齐文件清单")
  }
  if (!Array.isArray(next.warnings)) {
    next.warnings = []
    steps.push("补齐警告数组")
  }
  if (next.ai === undefined) {
    next.ai = buildAiExportDisclosure()
    steps.push("补齐 AI 生成声明")
  }
  if (next.reportPath !== "export-report.json") {
    next.reportPath = "export-report.json"
    steps.push("统一导出报告路径")
  }
  validateV3(next)
  return { manifest: next, steps }
}

/**
 * 项目包读取的唯一入口：先验 schema，再按明确版本迁移。
 * 不根据字段“碰巧存在”来猜版本，也不修改调用方传入的对象。
 */
export function readProjectPackage(value: unknown): ParsedProjectPackage {
  const source = record(value)
  if (source.schema !== PROJECT_PACKAGE_SCHEMA) {
    throw new Error("项目包格式不正确")
  }
  const version = Number(source.schemaVersion)
  if (!Number.isInteger(version)) {
    throw new Error("项目包缺少有效的 schemaVersion")
  }
  if (version < MIN_SUPPORTED_PROJECT_PACKAGE_VERSION) {
    throw new Error(`不支持的项目包版本：${version}`)
  }
  if (version > PROJECT_PACKAGE_SCHEMA_VERSION) {
    throw new Error(
      `项目包版本 ${version} 高于当前应用支持的 v${PROJECT_PACKAGE_SCHEMA_VERSION}，请升级后再导入`,
    )
  }
  validateCommon(source)

  if (version === 2) {
    const migrated = migrateV2ToV3(source)
    return {
      manifest: migrated.manifest as unknown as ProjectPackageManifest,
      migration: {
        fromVersion: 2,
        toVersion: PROJECT_PACKAGE_SCHEMA_VERSION,
        migrated: true,
        steps: migrated.steps,
      },
    }
  }

  validateV3(source)
  return {
    manifest: source as unknown as ProjectPackageManifest,
    migration: {
      fromVersion: version,
      toVersion: PROJECT_PACKAGE_SCHEMA_VERSION,
      migrated: false,
      steps: [],
    },
  }
}

/** 兼容只需要迁移后清单的调用方。 */
export function parseProjectPackage(value: unknown): ProjectPackageManifest {
  return readProjectPackage(value).manifest
}

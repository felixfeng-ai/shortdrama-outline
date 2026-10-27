import {
  PROJECT_PACKAGE_SCHEMA,
  PROJECT_PACKAGE_SCHEMA_VERSION,
  type ProjectPackageManifest,
} from "./package.ts"

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("项目包内容格式不正确")
  }
  return value as Record<string, unknown>
}

export function parseProjectPackage(value: unknown): ProjectPackageManifest {
  const manifest = record(value)
  if (manifest.schema !== PROJECT_PACKAGE_SCHEMA) {
    throw new Error("项目包格式不正确")
  }
  if (manifest.schemaVersion !== PROJECT_PACKAGE_SCHEMA_VERSION) {
    throw new Error(`不支持的项目包版本：${String(manifest.schemaVersion)}`)
  }
  if (manifest.mode !== "delivery" && manifest.mode !== "backup") {
    throw new Error("项目包导出模式不正确")
  }
  record(manifest.project)
  record(manifest.projectSettings)
  record(manifest.story)
  record(manifest.assets)
  for (const key of ["refs", "keyframes", "tasks", "snapshots", "files", "warnings"]) {
    if (!Array.isArray(manifest[key])) throw new Error(`项目包缺少 ${key}`)
  }
  return manifest as unknown as ProjectPackageManifest
}

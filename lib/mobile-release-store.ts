import fs from "node:fs"
import path from "node:path"

import { getDataDir } from "./assets/db.ts"
import {
  applyMobileReleaseRecord,
  resolveMobileRelease,
  type MobileRelease,
} from "./mobile-release.ts"

export const MOBILE_RELEASE_FILENAME = "app-release.json"

export function mobileReleaseFilePath(
  env: Record<string, string | undefined> = process.env,
): string {
  const configured = env.CHENGJU_APP_RELEASE_FILE?.trim()
  return configured && configured !== "undefined"
    ? path.resolve(configured)
    : path.join(getDataDir(), MOBILE_RELEASE_FILENAME)
}

/**
 * App 发布信息以数据目录里的 JSON 为最高优先级。
 * 每次请求重新读取，文件更新后无需重启 Web 或重新构建。
 */
export function resolveRuntimeMobileRelease(
  env: Record<string, string | undefined> = process.env,
): MobileRelease {
  const base = resolveMobileRelease(env)
  try {
    const raw = fs.readFileSync(mobileReleaseFilePath(env), "utf8")
    return applyMobileReleaseRecord(base, JSON.parse(raw))
  } catch {
    return base
  }
}

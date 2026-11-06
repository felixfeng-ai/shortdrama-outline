export const MOBILE_EAS_BUILDS_URL =
  "https://expo.dev/accounts/felix-ai/projects/veyaframe/builds"

export interface MobileReleaseLink {
  url: string
  direct: boolean
}

export interface MobileRelease {
  version: string
  releasedAt: string
  android: MobileReleaseLink
  ios: MobileReleaseLink
  notes: string[]
}

function httpsUrl(value: string | undefined): string | null {
  const raw = value?.trim()
  if (!raw) return null
  try {
    const url = new URL(raw)
    return url.protocol === "https:" ? url.toString() : null
  } catch {
    return null
  }
}

function validVersion(value: unknown): string | null {
  const raw = typeof value === "string" ? value.trim() : ""
  return /^[0-9A-Za-z._-]{1,32}$/.test(raw) ? raw : null
}

function version(value: string | undefined): string {
  return validVersion(value) ?? "1.0.0"
}

function validDate(value: unknown): string | null {
  const raw = typeof value === "string" ? value.trim() : ""
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null
}

function date(value: string | undefined): string {
  return validDate(value) ?? ""
}

function notes(value: string | undefined): string[] {
  const items = (value ?? "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 6)
  return items.length > 0
    ? items
    : [
        "Agent 完整项目上下文与受控写回",
        "整集 480P 草片和逐镜定稿标记",
        "视频审片播放、分段读取与类型化下载",
        "语音识别服务检测和可恢复错误提示",
      ]
}

export function resolveMobileRelease(
  env: Record<string, string | undefined> = process.env,
): MobileRelease {
  const android = httpsUrl(env.CHENGJU_APP_ANDROID_URL)
  const ios = httpsUrl(env.CHENGJU_APP_IOS_URL)
  return {
    version: version(env.CHENGJU_APP_VERSION),
    releasedAt: date(env.CHENGJU_APP_RELEASED_AT),
    android: {
      url: android ?? MOBILE_EAS_BUILDS_URL,
      direct: Boolean(android),
    },
    ios: {
      url: ios ?? MOBILE_EAS_BUILDS_URL,
      direct: Boolean(ios),
    },
    notes: notes(env.CHENGJU_APP_RELEASE_NOTES),
  }
}

/** 把服务器热更新的 JSON 清单叠加到环境变量默认值上。 */
export function applyMobileReleaseRecord(
  base: MobileRelease,
  record: unknown,
): MobileRelease {
  if (!record || typeof record !== "object" || Array.isArray(record)) return base
  const src = record as Record<string, unknown>
  const android = httpsUrl(
    typeof src.androidUrl === "string"
      ? src.androidUrl
      : typeof src.android_url === "string"
        ? src.android_url
        : undefined,
  )
  const ios = httpsUrl(
    typeof src.iosUrl === "string"
      ? src.iosUrl
      : typeof src.ios_url === "string"
        ? src.ios_url
        : undefined,
  )
  const recordNotes = Array.isArray(src.notes)
    ? src.notes
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 6)
    : []

  return {
    version: validVersion(src.version) ?? base.version,
    releasedAt: validDate(src.releasedAt ?? src.released_at) ?? base.releasedAt,
    android: android ? { url: android, direct: true } : base.android,
    ios: ios ? { url: ios, direct: true } : base.ios,
    notes: recordNotes.length > 0 ? recordNotes : base.notes,
  }
}

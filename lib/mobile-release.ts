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

function version(value: string | undefined): string {
  const raw = value?.trim() ?? ""
  return /^[0-9A-Za-z._-]{1,32}$/.test(raw) ? raw : "1.0.0"
}

function date(value: string | undefined): string {
  const raw = value?.trim() ?? ""
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : ""
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

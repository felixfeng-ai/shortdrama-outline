export interface ProductRelease {
  version: string
  publishedAt: string
  title: string
  highlights: readonly string[]
}

/**
 * 新版本必须添加在数组最上方，并同时更新 version、publishedAt、标题和更新条目。
 * 公告已读状态按 version 隔离，因此提高版本号后会自动重新提示。
 */
export const PRODUCT_RELEASES = [
  {
    version: "v2026.11.06",
    publishedAt: "2026-11-06T00:00:00+08:00",
    title: "VeyaFrame 火热内测中",
    highlights: [
      "平台正在火热内测，欢迎踊跃体验 AI 短剧创作、协作画布、Veya Agent 与全屏编排画布。",
      "手机 App 已支持安卓和鸿蒙扫码体验，iOS 版本更新中。",
      "使用中遇到问题可直接反馈；你的意见会进入下一轮产品更新。",
    ],
  },
] as const satisfies readonly ProductRelease[]

export const LATEST_PRODUCT_RELEASE = PRODUCT_RELEASES[0]

export function formatReleaseTimestamp(value: string): string {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value))
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? ""
  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}`
}

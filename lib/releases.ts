export interface ProductRelease {
  version: string
  publishedAt: string
  status: string
  title: string
  summary: string
  highlights: readonly string[]
}

/**
 * 新版本必须添加在数组最上方，并同时更新 version、publishedAt、标题和更新条目。
 * 公告已读状态按 version 隔离，因此提高版本号后会自动重新提示。
 */
export const PRODUCT_RELEASES = [
  {
    version: "v2026.11.09",
    publishedAt: "2026-11-09T00:00:00+08:00",
    status: "LIVE BETA",
    title: "VeyaTV 内测开放中",
    summary: "从一句故事到成片，AI 短剧与漫剧生产链路开放体验",
    highlights: [
      "平台正在内测，欢迎体验从故事构思、分镜视频到成片交付的完整链路，并直接反馈问题。",
      "主品牌统一为 VeyaTV，Veya Agent 与 Veya Canvas 继续提供创作与画布编排。",
      "官网已切换至 veyatv.com；Android 与 HarmonyOS App 支持扫码体验，iOS 版本更新中。",
    ],
  },
  {
    version: "v2026.11.08",
    publishedAt: "2026-11-08T00:00:00+08:00",
    status: "LIVE BETA",
    title: "VeyaTV 品牌更新",
    summary: "平台正式统一为 VeyaTV，定位 AI 短剧与漫剧生产平台",
    highlights: [
      "母品牌统一为 Veya，平台主品牌为 VeyaTV；成剧仅作为中文辅助名保留。",
      "品类定位更新为 AI 短剧与漫剧生产平台，覆盖创作、视觉资产、镜头视频、时间线与成片。",
      "Veya Agent 与 Veya Canvas 继续作为平台内子品牌；官网已切换为 veyatv.com。",
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

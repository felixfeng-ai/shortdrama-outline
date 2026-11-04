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
    version: "v2026.11.04",
    publishedAt: "2026-11-04T23:53:00+08:00",
    title: "Veya Agent 与品牌统一",
    highlights: [
      "AI 场记升级为 Veya Agent，会话选择与新建会话统一为一条控制栏。",
      "浏览器标题、favicon、PWA 名称统一为 VeyaFrame。",
      "内测条款、隐私说明、统一法务页脚与登录协议确认上线。",
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

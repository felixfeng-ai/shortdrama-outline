export const DELIVERY_PLATFORMS = [
  "douyin",
  "kuaishou",
  "wechat",
  "tiktok",
  "reels",
  "shorts",
  "bilibili",
  "youtube",
] as const

export type DeliveryPlatform = (typeof DELIVERY_PLATFORMS)[number]
export type DeliverySubtitleMode = "sidecar" | "burned" | "both"

export interface DeliveryPlatformProfile {
  id: DeliveryPlatform
  label: string
  ratio: "9:16" | "16:9"
  width: number
  height: number
  maxDurationSeconds: number
  maxFileBytes: number
  titleLimit: number
  descriptionLimit: number
  hashtagLimit: number
  requiresBurnedSubtitle: boolean
  requiresCover: boolean
  uploadUrl: string
  version: string
}

const PROFILES: Record<DeliveryPlatform, DeliveryPlatformProfile> = {
  douyin: {
    id: "douyin", label: "抖音", ratio: "9:16", width: 1080, height: 1920,
    maxDurationSeconds: 900, maxFileBytes: 4 * 1024 ** 3,
    titleLimit: 55, descriptionLimit: 1_000, hashtagLimit: 20,
    requiresBurnedSubtitle: true, requiresCover: true,
    uploadUrl: "https://creator.douyin.com/creator-micro/content/upload", version: "2026-11",
  },
  kuaishou: {
    id: "kuaishou", label: "快手", ratio: "9:16", width: 1080, height: 1920,
    maxDurationSeconds: 900, maxFileBytes: 4 * 1024 ** 3,
    titleLimit: 60, descriptionLimit: 1_000, hashtagLimit: 20,
    requiresBurnedSubtitle: true, requiresCover: true,
    uploadUrl: "https://cp.kuaishou.com/article/publish/video", version: "2026-11",
  },
  wechat: {
    id: "wechat", label: "视频号", ratio: "9:16", width: 1080, height: 1920,
    maxDurationSeconds: 1_800, maxFileBytes: 2 * 1024 ** 3,
    titleLimit: 60, descriptionLimit: 1_000, hashtagLimit: 20,
    requiresBurnedSubtitle: true, requiresCover: true,
    uploadUrl: "https://channels.weixin.qq.com/platform/post/create", version: "2026-11",
  },
  tiktok: {
    id: "tiktok", label: "TikTok", ratio: "9:16", width: 1080, height: 1920,
    maxDurationSeconds: 600, maxFileBytes: 4 * 1024 ** 3,
    titleLimit: 2_200, descriptionLimit: 2_200, hashtagLimit: 30,
    requiresBurnedSubtitle: true, requiresCover: true,
    uploadUrl: "https://www.tiktok.com/tiktokstudio/upload", version: "2026-11",
  },
  reels: {
    id: "reels", label: "Instagram Reels", ratio: "9:16", width: 1080, height: 1920,
    maxDurationSeconds: 180, maxFileBytes: 2 * 1024 ** 3,
    titleLimit: 125, descriptionLimit: 2_200, hashtagLimit: 30,
    requiresBurnedSubtitle: true, requiresCover: true,
    uploadUrl: "https://www.instagram.com/", version: "2026-11",
  },
  shorts: {
    id: "shorts", label: "YouTube Shorts", ratio: "9:16", width: 1080, height: 1920,
    maxDurationSeconds: 180, maxFileBytes: 8 * 1024 ** 3,
    titleLimit: 100, descriptionLimit: 5_000, hashtagLimit: 30,
    requiresBurnedSubtitle: true, requiresCover: true,
    uploadUrl: "https://studio.youtube.com/", version: "2026-11",
  },
  bilibili: {
    id: "bilibili", label: "B站", ratio: "16:9", width: 1920, height: 1080,
    maxDurationSeconds: 1_800, maxFileBytes: 8 * 1024 ** 3,
    titleLimit: 80, descriptionLimit: 2_000, hashtagLimit: 20,
    requiresBurnedSubtitle: true, requiresCover: true,
    uploadUrl: "https://member.bilibili.com/platform/upload/video/frame", version: "2026-11",
  },
  youtube: {
    id: "youtube", label: "YouTube", ratio: "16:9", width: 1920, height: 1080,
    maxDurationSeconds: 900, maxFileBytes: 12 * 1024 ** 3,
    titleLimit: 100, descriptionLimit: 5_000, hashtagLimit: 30,
    requiresBurnedSubtitle: true, requiresCover: true,
    uploadUrl: "https://studio.youtube.com/", version: "2026-11",
  },
}

export interface PublishMetadata {
  projectTitle: string
  episode: number
  episodeTitle: string
  title: string
  description: string
  hashtags: string[]
  aiDisclosure: string
  durationMs: number
  width: number
  height: number
  resolution: string
  sizeBytes: number
  subtitleMode: DeliverySubtitleMode
  coverAvailable: boolean
}

export interface PublishIssue {
  code:
    | "ratio-mismatch"
    | "duration-too-long"
    | "file-too-large"
    | "title-too-long"
    | "description-too-long"
    | "hashtags-too-many"
    | "cover-missing"
    | "subtitle-not-burned"
  message: string
}

export function readDeliveryPlatform(value: unknown): DeliveryPlatform {
  return (DELIVERY_PLATFORMS as readonly unknown[]).includes(value)
    ? value as DeliveryPlatform
    : "douyin"
}

export function readDeliverySubtitleMode(value: unknown): DeliverySubtitleMode {
  return value === "sidecar" || value === "burned" || value === "both"
    ? value
    : "both"
}

export function deliveryPlatformProfile(platform: DeliveryPlatform): DeliveryPlatformProfile {
  return PROFILES[platform]
}

export function buildPublishMetadata(input: {
  projectTitle: string
  episode: number
  episodeTitle?: string
  title?: string
  description?: string
  hashtags?: string[]
  durationMs: number
  width: number
  height: number
  sizeBytes: number
  subtitleMode: DeliverySubtitleMode
  coverAvailable: boolean
}): PublishMetadata {
  const projectTitle = input.projectTitle.trim() || "未命名项目"
  const episode = Math.max(1, Math.floor(input.episode))
  const episodeTitle = (input.episodeTitle ?? "").trim()
  const title = (input.title ?? `${projectTitle} · 第 ${episode} 集${episodeTitle ? ` · ${episodeTitle}` : ""}`)
    .trim()
    .slice(0, 220)
  const description = (
    input.description
    ?? `《${projectTitle}》第 ${episode} 集${episodeTitle ? `「${episodeTitle}」` : ""}。本片包含人工智能生成或辅助生成内容，发布时请遵守目标平台规则。`
  ).trim()
  const hashtags = [...new Set(
    (input.hashtags ?? ["AI短剧", "短剧", "VeyaTV"])
      .map((item) => item.trim().replace(/^#/, ""))
      .filter(Boolean),
  )]
  return {
    projectTitle,
    episode,
    episodeTitle,
    title,
    description,
    hashtags,
    aiDisclosure: "AI 生成内容声明：本片包含由人工智能生成或辅助生成的内容。",
    durationMs: Math.max(0, Math.floor(input.durationMs)),
    width: Math.max(0, Math.floor(input.width)),
    height: Math.max(0, Math.floor(input.height)),
    resolution: `${Math.max(0, Math.floor(input.width))}x${Math.max(0, Math.floor(input.height))}`,
    sizeBytes: Math.max(0, Math.floor(input.sizeBytes)),
    subtitleMode: input.subtitleMode,
    coverAvailable: input.coverAvailable,
  }
}

export function validatePublishReadiness(
  profile: DeliveryPlatformProfile,
  metadata: PublishMetadata,
): { ready: boolean; issues: PublishIssue[] } {
  const issues: PublishIssue[] = []
  const expectedWidth = profile.width
  const expectedHeight = profile.height
  if (metadata.width !== expectedWidth || metadata.height !== expectedHeight) {
    issues.push({
      code: "ratio-mismatch",
      message: `${profile.label} 需要 ${expectedWidth}x${expectedHeight}，当前是 ${metadata.resolution}`,
    })
  }
  if (metadata.durationMs > profile.maxDurationSeconds * 1_000) {
    issues.push({
      code: "duration-too-long",
      message: `时长超过 ${profile.label} 的 ${profile.maxDurationSeconds} 秒限制`,
    })
  }
  if (metadata.sizeBytes > profile.maxFileBytes) {
    issues.push({ code: "file-too-large", message: `文件超过 ${profile.label} 的大小限制` })
  }
  if (metadata.title.length > profile.titleLimit) {
    issues.push({ code: "title-too-long", message: `标题超过 ${profile.titleLimit} 字` })
  }
  if (metadata.description.length > profile.descriptionLimit) {
    issues.push({ code: "description-too-long", message: `简介超过 ${profile.descriptionLimit} 字` })
  }
  if (metadata.hashtags.length > profile.hashtagLimit) {
    issues.push({ code: "hashtags-too-many", message: `话题超过 ${profile.hashtagLimit} 个` })
  }
  if (profile.requiresCover && !metadata.coverAvailable) {
    issues.push({ code: "cover-missing", message: `${profile.label} 发布需要封面` })
  }
  if (
    profile.requiresBurnedSubtitle
    && metadata.subtitleMode !== "burned"
    && metadata.subtitleMode !== "both"
  ) {
    issues.push({
      code: "subtitle-not-burned",
      message: `${profile.label} 直接发布需要烧录字幕版本`,
    })
  }
  return { ready: issues.length === 0, issues }
}

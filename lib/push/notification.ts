import type { GenerationStatus, GenerationTargetType, MediaKind } from "../generation/types.ts"

export interface GenerationNotificationPayload {
  title: string
  body: string
  url: string
  tag: string
}

export function buildGenerationNotification(input: {
  taskId: string
  targetType: GenerationTargetType
  status: GenerationStatus
  mediaKind?: MediaKind
  error?: string | null
}): GenerationNotificationPayload | null {
  if (input.status !== "succeeded" && input.status !== "failed") return null
  const video = input.mediaKind === "video"
  const target = video
    ? "镜头视频"
    : input.targetType === "character"
      ? "定妆图"
      : input.targetType === "place"
        ? "场景图"
        : "镜头首帧"
  const url = input.targetType === "character"
    ? "/?step=visuals"
    : input.targetType === "place"
      ? "/?step=scenes"
      : "/?step=shots"
  if (input.status === "succeeded") {
    return {
      title: `${target}已生成`,
      body: video
        ? "打开成剧查看最新视频候选并决定是否采用。"
        : "打开成剧查看最新关键帧并决定是否采用。",
      url,
      tag: `generation-${input.taskId}`,
    }
  }
  return {
    title: `${target}生成失败`,
    body: publicFailureText(input.error, video),
    url,
    tag: `generation-${input.taskId}`,
  }
}

function publicFailureText(
  value: string | null | undefined,
  video: boolean,
): string {
  const error = value?.trim() ?? ""
  if (/api[- ]?key|access.?key|unauthorized|invalid.?token|sk-/i.test(error)) {
    return video
      ? "平台视频服务异常，请打开任务中心重试。"
      : "平台图像服务异常，请打开任务中心重试。"
  }
  if (/[/\\]|data\/|generated|文件|路径/i.test(error)) {
    return "生成失败，请打开任务中心重试。"
  }
  return error ? error.slice(0, 80) : "生成失败，请打开任务中心重试。"
}

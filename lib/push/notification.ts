import type { GenerationStatus, GenerationTargetType } from "../generation/types.ts"

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
  error?: string | null
}): GenerationNotificationPayload | null {
  if (input.status !== "succeeded" && input.status !== "failed") return null
  const target = input.targetType === "character" ? "定妆图" : "镜头首帧"
  const url = input.targetType === "character" ? "/?step=visuals" : "/?step=shots"
  if (input.status === "succeeded") {
    return {
      title: `${target}已生成`,
      body: "打开成剧查看最新关键帧并决定是否采用。",
      url,
      tag: `generation-${input.taskId}`,
    }
  }
  return {
    title: `${target}生成失败`,
    body: publicFailureText(input.error),
    url,
    tag: `generation-${input.taskId}`,
  }
}

function publicFailureText(value: string | null | undefined): string {
  const error = value?.trim() ?? ""
  if (/api[- ]?key|access.?key|unauthorized|invalid.?token|sk-/i.test(error)) {
    return "平台图像服务异常，请打开任务中心重试。"
  }
  if (/[/\\]|data\/|generated|文件|路径/i.test(error)) {
    return "生成失败，请打开任务中心重试。"
  }
  return error ? error.slice(0, 80) : "生成失败，请打开任务中心重试。"
}

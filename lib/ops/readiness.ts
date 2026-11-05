export interface ReadinessResult {
  errors: string[]
  warnings: string[]
}

function value(env: Record<string, string | undefined>, key: string): string {
  return env[key]?.trim() ?? ""
}

export function checkProductionReadiness(
  env: Record<string, string | undefined>,
): ReadinessResult {
  const errors: string[] = []
  const warnings: string[] = []

  for (const key of ["DEEPSEEK_API_KEY", "ALIYUN_DASHSCOPE_API_KEY"]) {
    if (!value(env, key)) errors.push(`缺少 ${key}`)
  }
  if (value(env, "AUTH_SECRET").length < 32) {
    errors.push("AUTH_SECRET 必须是至少 32 字符的随机值")
  }
  if (value(env, "AUTH_ALLOW_DEV_CODE") === "1") {
    errors.push("生产环境必须关闭 AUTH_ALLOW_DEV_CODE")
  }
  if (!value(env, "RESEND_API_KEY")) errors.push("缺少 RESEND_API_KEY，邮箱登录不可用")
  const emailFrom = value(env, "AUTH_EMAIL_FROM")
  if (!emailFrom) errors.push("缺少 AUTH_EMAIL_FROM，邮箱登录不可用")
  if (/your-domain\.example|example\.com/i.test(emailFrom)) {
    errors.push("AUTH_EMAIL_FROM 仍是示例域名，不能用于生产邮箱登录")
  }
  if (emailFrom && !/<[^>]+@[^>]+>/.test(emailFrom) && !/^[^@\s]+@[^@\s]+$/.test(emailFrom)) {
    errors.push("AUTH_EMAIL_FROM 格式不正确")
  }

  const videoEnabled = /^(1|true|yes|on)$/i.test(value(env, "VIDEO_GENERATION_ENABLED"))
  if (videoEnabled && !value(env, "MINIMAX_API_KEY")) {
    errors.push("VIDEO_GENERATION_ENABLED 已开启，但缺少 MINIMAX_API_KEY")
  } else if (!videoEnabled) {
    warnings.push("视频生成未启用，App 只能生成关键帧")
  }

  const ttsEnabled = /^(1|true|yes|on)$/i.test(value(env, "TTS_ENABLED"))
  if (ttsEnabled) {
    const speechKey = value(env, "MINIMAX_TTS_API_KEY") || value(env, "MINIMAX_API_KEY")
    if (!speechKey) errors.push("缺少 MINIMAX_TTS_API_KEY，TTS 不可用")
    const price = Number(value(env, "MINIMAX_TTS_PRICE_MICROS_PER_1K_CHARS"))
    if (!Number.isSafeInteger(price) || price <= 0) {
      errors.push("缺少有效的 MINIMAX_TTS_PRICE_MICROS_PER_1K_CHARS")
    }
  } else {
    warnings.push("TTS 未启用，角色音色只能配置，不能生成对白")
  }

  const pushPublic = value(env, "WEB_PUSH_PUBLIC_KEY")
  const pushPrivate = value(env, "WEB_PUSH_PRIVATE_KEY")
  if (Boolean(pushPublic) !== Boolean(pushPrivate)) {
    errors.push("Web Push 公私钥必须同时配置")
  } else if (!pushPublic || !pushPrivate) {
    warnings.push("未配置 Web Push，生成完成通知不会发送")
  }

  return { errors, warnings }
}

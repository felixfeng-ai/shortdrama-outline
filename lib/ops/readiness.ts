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

  const pushPublic = value(env, "WEB_PUSH_PUBLIC_KEY")
  const pushPrivate = value(env, "WEB_PUSH_PRIVATE_KEY")
  if (Boolean(pushPublic) !== Boolean(pushPrivate)) {
    errors.push("Web Push 公私钥必须同时配置")
  } else if (!pushPublic || !pushPrivate) {
    warnings.push("未配置 Web Push，生成完成通知不会发送")
  }

  return { errors, warnings }
}

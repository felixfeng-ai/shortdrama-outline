import { AuthError } from "./service.ts"

const RESEND_ENDPOINT = "https://api.resend.com/emails"
const SEND_TIMEOUT_MS = 15_000

function config(): { apiKey: string; from: string } | null {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  const from = process.env.AUTH_EMAIL_FROM?.trim()
  return apiKey && from ? { apiKey, from } : null
}

export function emailAuthConfigured(): boolean {
  return config() !== null
}

export async function sendLoginCodeEmail(email: string, code: string): Promise<void> {
  const current = config()
  if (!current) {
    throw new AuthError("邮箱登录通道尚未配置，请联系管理员", 503)
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS)
  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${current.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: current.from,
        to: [email],
        subject: "成剧 VeyaFrame 登录验证码",
        text: [
          `你的登录验证码是：${code}`,
          "",
          "验证码 5 分钟内有效，只能使用一次。",
          "如果不是你本人发起登录，请忽略这封邮件。",
          "",
          "成剧 VeyaFrame",
        ].join("\n"),
        html: `
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#172018;line-height:1.7">
            <p>你的登录验证码是：</p>
            <p style="font-size:30px;font-weight:700;letter-spacing:8px;margin:20px 0">${code}</p>
            <p>验证码 5 分钟内有效，只能使用一次。</p>
            <p style="color:#667066">如果不是你本人发起登录，请忽略这封邮件。</p>
            <p style="margin-top:28px">成剧 VeyaFrame</p>
          </div>
        `,
      }),
      signal: controller.signal,
    })
    if (!response.ok) {
      console.error("[auth-email] Resend 发送失败", response.status)
      throw new AuthError("验证码邮件发送失败，请稍后再试", 502)
    }
  } catch (error) {
    if (error instanceof AuthError) throw error
    console.error("[auth-email] 邮件服务请求失败", error instanceof Error ? error.name : "unknown")
    throw new AuthError("验证码邮件发送失败，请稍后再试", 502)
  } finally {
    clearTimeout(timer)
  }
}

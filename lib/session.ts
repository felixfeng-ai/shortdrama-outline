// 匿名浏览器会话。
//
// Cookie 本身就是高熵 bearer token，服务端只把它当作 ownerId。
// 有效 token 无法从其他用户 ID 推导，因此不需要再存一份 session 表。
export const SESSION_COOKIE = "chengju_sid"
/** 仅 localhost 使用：稳定身份，保证本地升级/重启后旧项目不丢。 */
export const LOCAL_SESSION_ID = "anon_local_development_session_0000000000000000"

const SESSION_PATTERN = /^anon_[A-Za-z0-9_-]{40,}$/

export function isSessionId(value: string | null | undefined): value is string {
  return !!value && SESSION_PATTERN.test(value)
}

export function ownerFromRequest(req: Request): string {
  const raw = req.headers.get("cookie") ?? ""
  for (const part of raw.split(";")) {
    const [name, ...rest] = part.trim().split("=")
    if (name !== SESSION_COOKIE) continue
    const value = rest.join("=")
    if (isSessionId(value)) return value
  }
  // 路由单测会直接调用处理函数，不会经过 middleware；开发环境归到 local。
  return "local"
}

export function makeSessionId(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("")
  return `anon_${btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`
}

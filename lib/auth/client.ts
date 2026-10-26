export interface AuthUserDto {
  id: string
  phone: string
  displayName: string
}

export interface AuthSessionDto {
  id: string
  client: string
  deviceName: string
  createdAt: number
  lastSeenAt: number
  expiresAt: number
  current: boolean
}

async function payload<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null)
  if (!response.ok || !body?.success) {
    throw new Error(body?.error || "登录服务暂不可用")
  }
  return body.data as T
}

export async function fetchAuthSession(): Promise<{ user: AuthUserDto | null }> {
  return payload(await fetch("/api/auth/session", { cache: "no-store" }))
}

export async function fetchAuthSessions(): Promise<{ sessions: AuthSessionDto[] }> {
  return payload(await fetch("/api/auth/sessions", { cache: "no-store" }))
}

export async function revokeAuthSession(sessionId: string): Promise<{ revoked: boolean }> {
  return payload(await fetch("/api/auth/sessions", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId }),
  }))
}

export async function requestAuthCode(phone: string): Promise<{
  expiresAt: number
  cooldownSeconds: number
  devCode?: string
}> {
  return payload(await fetch("/api/auth/request-code", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ phone }),
  }))
}

export async function verifyAuthCode(phone: string, code: string): Promise<{
  user: AuthUserDto
  claimed?: { projects?: number; pushSubscriptions?: number }
}> {
  return payload(await fetch("/api/auth/verify-code", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ phone, code }),
  }))
}

export async function logoutAuth(): Promise<void> {
  await payload(await fetch("/api/auth/logout", { method: "POST" }))
}

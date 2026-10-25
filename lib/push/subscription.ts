export interface PushSubscriptionInput {
  endpoint: string
  keys: {
    p256dh: string
    auth: string
  }
}

export function isAllowedPushEndpoint(value: string): boolean {
  try {
    const url = new URL(value)
    if (url.protocol !== "https:" || !url.hostname) return false
    const host = url.hostname.toLowerCase()
    return host === "fcm.googleapis.com"
      || host === "updates.push.services.mozilla.com"
      || host === "web.push.apple.com"
      || host.endsWith(".push.apple.com")
      || host === "notify.windows.com"
      || host.endsWith(".notify.windows.com")
  } catch {
    return false
  }
}

export function readPushSubscription(value: unknown): PushSubscriptionInput | null {
  if (!value || typeof value !== "object") return null
  const record = value as Record<string, unknown>
  const endpoint = typeof record.endpoint === "string" ? record.endpoint.trim() : ""
  if (!endpoint || endpoint.length > 2048 || !isAllowedPushEndpoint(endpoint)) return null
  if (!record.keys || typeof record.keys !== "object") return null
  const keys = record.keys as Record<string, unknown>
  const p256dh = typeof keys.p256dh === "string" ? keys.p256dh.trim() : ""
  const auth = typeof keys.auth === "string" ? keys.auth.trim() : ""
  if (!p256dh || !auth || p256dh.length > 512 || auth.length > 512) return null
  return { endpoint, keys: { p256dh, auth } }
}

const PUSH_API = "/api/push/subscription"

export interface PushConfig {
  enabled: boolean
  publicKey: string
}

function withPushTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer)
  })
}

async function readPayload<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload?.success || !payload.data) {
    throw new Error(payload?.error || "完成通知服务暂不可用")
  }
  return payload.data as T
}

export async function fetchPushConfig(): Promise<PushConfig> {
  return readPayload<PushConfig>(await fetch(PUSH_API, { cache: "no-store" }))
}

function base64UrlToBytes(value: string): ArrayBuffer {
  const padding = "=".repeat((4 - value.length % 4) % 4)
  const binary = atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"))
  return Uint8Array.from(binary, (char) => char.charCodeAt(0)).buffer as ArrayBuffer
}

async function saveSubscription(subscription: PushSubscription): Promise<void> {
  const json = subscription.toJSON()
  await readPayload<{ id: string }>(await fetch(PUSH_API, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      subscription: {
        endpoint: json.endpoint,
        keys: json.keys,
      },
    }),
  }))
}

export async function activePushSubscription(): Promise<PushSubscription | null> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null
  const registration = await withPushTimeout(
    navigator.serviceWorker.ready,
    15_000,
    "浏览器未能完成推送服务初始化，请刷新页面后重试",
  )
  return registration.pushManager.getSubscription()
}

export async function enablePushNotifications(publicKey: string): Promise<PushSubscription> {
  const permission = await Notification.requestPermission()
  if (permission !== "granted") throw new Error("浏览器没有授予通知权限")
  await navigator.serviceWorker.register("/sw.js")
  const registration = await withPushTimeout(
    navigator.serviceWorker.ready,
    15_000,
    "浏览器未能完成推送服务初始化，请刷新页面后重试",
  )
  const existing = await registration.pushManager.getSubscription()
  const subscription = existing ?? await withPushTimeout(
    registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToBytes(publicKey),
    }),
    15_000,
    "浏览器未能完成推送订阅，请确认不是无痕模式并检查通知权限",
  )
  await saveSubscription(subscription)
  return subscription
}

export async function disablePushNotifications(): Promise<void> {
  const registration = await withPushTimeout(
    navigator.serviceWorker.ready,
    15_000,
    "浏览器未能完成推送服务初始化，请刷新页面后重试",
  )
  const subscription = await registration.pushManager.getSubscription()
  if (!subscription) return
  await fetch(PUSH_API, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  })
  await subscription.unsubscribe()
}

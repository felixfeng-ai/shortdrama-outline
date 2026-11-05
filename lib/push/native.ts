import type { DatabaseSync } from "node:sqlite"

import {
  listNativePushTokens,
  removeNativePushToken,
} from "./native-repo.ts"

export interface NativePushData {
  projectId?: string
  targetType: string
  targetId: string
  assetId?: string | null
  targetLabel?: string
  mediaKind?: "image" | "video" | "audio"
}

export async function sendNativePushToOwner(
  db: DatabaseSync,
  ownerId: string,
  payload: {
    title: string
    body: string
    tag: string
  },
  data: NativePushData,
  fetchImpl: typeof fetch = fetch,
): Promise<{ sent: number; failed: number; removed: number }> {
  const tokens = listNativePushTokens(db, ownerId)
  if (tokens.length === 0) return { sent: 0, failed: 0, removed: 0 }

  const messages = tokens.map((token) => ({
    to: token.token,
    title: payload.title,
    body: payload.body,
    sound: "default",
    data: { ...data, route: data.assetId ? "review" : "tasks" },
    channelId: "generation",
  }))
  let response: Response
  try {
    response = await fetchImpl("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(messages),
    })
  } catch {
    return { sent: 0, failed: tokens.length, removed: 0 }
  }
  if (!response.ok) return { sent: 0, failed: tokens.length, removed: 0 }

  const body = await response.json().catch(() => null) as {
    data?: Array<{ status?: string; details?: { error?: string } }>
  } | null
  const receipts = body?.data ?? []
  let sent = 0
  let failed = 0
  let removed = 0
  tokens.forEach((token, index) => {
    const receipt = receipts[index]
    if (receipt?.status === "ok") {
      sent += 1
      return
    }
    failed += 1
    if (receipt?.details?.error === "DeviceNotRegistered") {
      if (removeNativePushToken(db, ownerId, token.token)) removed += 1
    }
  })
  return { sent, failed, removed }
}

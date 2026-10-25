import type { DatabaseSync } from "node:sqlite"
import webpush from "web-push"

import type { GenerationNotificationPayload } from "./notification.ts"
import {
  buildGenerationNotification,
} from "./notification.ts"
import {
  listPushSubscriptions,
  removePushSubscription,
  type StoredPushSubscription,
} from "./repo.ts"

export interface PushSendResult {
  sent: number
  failed: number
  removed: number
}

export interface PushSendOptions {
  env?: Record<string, string | undefined>
  sendNotification?: (
    subscription: Pick<StoredPushSubscription, "endpoint" | "keys">,
    payload: string,
  ) => Promise<unknown>
}

function pushConfig(env: Record<string, string | undefined>) {
  const publicKey = env.WEB_PUSH_PUBLIC_KEY?.trim() ?? ""
  const privateKey = env.WEB_PUSH_PRIVATE_KEY?.trim() ?? ""
  const subject = env.WEB_PUSH_SUBJECT?.trim() || "mailto:admin@chengju.work"
  return publicKey && privateKey ? { publicKey, privateKey, subject } : null
}

export async function sendPushToOwner(
  db: DatabaseSync,
  ownerId: string,
  payload: GenerationNotificationPayload,
  options: PushSendOptions = {},
): Promise<PushSendResult> {
  const config = pushConfig(options.env ?? process.env)
  if (!config) return { sent: 0, failed: 0, removed: 0 }
  const subscriptions = listPushSubscriptions(db, ownerId)
  if (subscriptions.length === 0) return { sent: 0, failed: 0, removed: 0 }

  const sender = options.sendNotification ?? (async (subscription, body) => {
    webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey)
    return webpush.sendNotification(subscription, body)
  })
  let sent = 0
  let failed = 0
  let removed = 0
  const body = JSON.stringify(payload)

  await Promise.all(subscriptions.map(async (subscription) => {
    try {
      await sender(subscription, body)
      sent += 1
    } catch (error) {
      failed += 1
      const statusCode = error && typeof error === "object"
        ? (error as { statusCode?: unknown }).statusCode
        : null
      if (statusCode === 404 || statusCode === 410) {
        if (removePushSubscription(db, ownerId, subscription.endpoint)) removed += 1
      }
    }
  }))

  return { sent, failed, removed }
}

export async function notifyGenerationFinished(
  db: DatabaseSync,
  ownerId: string,
  input: {
    taskId: string
    targetType: "character" | "shot"
    status: "queued" | "running" | "succeeded" | "failed" | "canceled"
    error?: string | null
  },
  options: PushSendOptions = {},
): Promise<PushSendResult> {
  const payload = buildGenerationNotification(input)
  if (!payload) return { sent: 0, failed: 0, removed: 0 }
  return sendPushToOwner(db, ownerId, payload, options)
}

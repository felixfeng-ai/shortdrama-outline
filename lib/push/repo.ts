import type { DatabaseSync } from "node:sqlite"
import { randomUUID } from "node:crypto"

import type { PushSubscriptionInput } from "./subscription.ts"

export interface StoredPushSubscription extends PushSubscriptionInput {
  id: string
  ownerId: string
  createdAt: number
  updatedAt: number
}

interface PushSubscriptionRow {
  id: string
  owner_id: string
  endpoint: string
  p256dh: string
  auth: string
  created_at: number
  updated_at: number
}

function toSubscription(row: PushSubscriptionRow): StoredPushSubscription {
  return {
    id: row.id,
    ownerId: row.owner_id,
    endpoint: row.endpoint,
    keys: { p256dh: row.p256dh, auth: row.auth },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function upsertPushSubscription(
  db: DatabaseSync,
  ownerId: string,
  subscription: PushSubscriptionInput,
): StoredPushSubscription {
  const now = Date.now()
  db.prepare(
    `INSERT INTO push_subscriptions
      (id, owner_id, endpoint, p256dh, auth, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(owner_id, endpoint) DO UPDATE SET
       p256dh = excluded.p256dh,
       auth = excluded.auth,
       updated_at = excluded.updated_at`,
  ).run(
    randomUUID(),
    ownerId,
    subscription.endpoint,
    subscription.keys.p256dh,
    subscription.keys.auth,
    now,
    now,
  )
  const row = db.prepare(
    "SELECT * FROM push_subscriptions WHERE owner_id = ? AND endpoint = ?",
  ).get(ownerId, subscription.endpoint) as PushSubscriptionRow | undefined
  if (!row) throw new Error("Web Push 订阅保存失败")
  return toSubscription(row)
}

export function listPushSubscriptions(
  db: DatabaseSync,
  ownerId: string,
): StoredPushSubscription[] {
  const rows = db.prepare(
    "SELECT * FROM push_subscriptions WHERE owner_id = ? ORDER BY created_at DESC",
  ).all(ownerId) as PushSubscriptionRow[]
  return rows.map(toSubscription)
}

export function removePushSubscription(
  db: DatabaseSync,
  ownerId: string,
  endpoint: string,
): boolean {
  const result = db.prepare(
    "DELETE FROM push_subscriptions WHERE owner_id = ? AND endpoint = ?",
  ).run(ownerId, endpoint)
  return Number(result.changes) > 0
}

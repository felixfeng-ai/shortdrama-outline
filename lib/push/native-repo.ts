import type { DatabaseSync } from "node:sqlite"
import { randomUUID } from "node:crypto"

export interface NativePushTokenInput {
  token: string
  platform: "ios" | "android" | "unknown"
  deviceName: string
}

export interface StoredNativePushToken extends NativePushTokenInput {
  id: string
  ownerId: string
  createdAt: number
  updatedAt: number
}

interface NativePushTokenRow {
  id: string
  owner_id: string
  token: string
  platform: string
  device_name: string
  created_at: number
  updated_at: number
}

export function readNativePushToken(value: unknown): NativePushTokenInput {
  if (!value || typeof value !== "object") throw new Error("推送 Token 格式不正确")
  const record = value as Record<string, unknown>
  const token = typeof record.token === "string" ? record.token.trim() : ""
  if (!/^(ExponentPushToken|ExpoPushToken)\[[^\]]{8,}\]$/.test(token)) {
    throw new Error("推送 Token 格式不正确")
  }
  const platform = record.platform === "ios" || record.platform === "android"
    ? record.platform
    : "unknown"
  const deviceName = typeof record.deviceName === "string"
    ? record.deviceName.trim().slice(0, 80)
    : ""
  return { token, platform, deviceName }
}

function toToken(row: NativePushTokenRow): StoredNativePushToken {
  return {
    id: row.id,
    ownerId: row.owner_id,
    token: row.token,
    platform: row.platform as NativePushTokenInput["platform"],
    deviceName: row.device_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function upsertNativePushToken(
  db: DatabaseSync,
  ownerId: string,
  value: unknown,
): StoredNativePushToken {
  const input = readNativePushToken(value)
  const now = Date.now()
  db.prepare(
    `INSERT INTO mobile_push_tokens
      (id, owner_id, token, platform, device_name, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(owner_id, token) DO UPDATE SET
       platform = excluded.platform,
       device_name = excluded.device_name,
       updated_at = excluded.updated_at`,
  ).run(randomUUID(), ownerId, input.token, input.platform, input.deviceName, now, now)
  const row = db.prepare(
    "SELECT * FROM mobile_push_tokens WHERE owner_id = ? AND token = ?",
  ).get(ownerId, input.token) as NativePushTokenRow | undefined
  if (!row) throw new Error("推送 Token 保存失败")
  return toToken(row)
}

export function listNativePushTokens(
  db: DatabaseSync,
  ownerId: string,
): StoredNativePushToken[] {
  const rows = db.prepare(
    "SELECT * FROM mobile_push_tokens WHERE owner_id = ? ORDER BY updated_at DESC",
  ).all(ownerId) as NativePushTokenRow[]
  return rows.map(toToken)
}

export function removeNativePushToken(
  db: DatabaseSync,
  ownerId: string,
  token: string,
): boolean {
  const result = db.prepare(
    "DELETE FROM mobile_push_tokens WHERE owner_id = ? AND token = ?",
  ).run(ownerId, token.trim())
  return Number(result.changes) > 0
}

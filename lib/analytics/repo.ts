import type { DatabaseSync } from "node:sqlite"
import { randomUUID } from "node:crypto"

const EVENT_NAME = /^[a-z][a-z0-9_]{1,63}$/
const PROPERTY_KEYS = new Set([
  "durationMs",
  "screen",
  "projectId",
  "taskStatus",
  "result",
  "mode",
  "from",
  "to",
])

export interface AnalyticsEventInput {
  name: string
  path: string
  properties: Record<string, string | number | boolean>
}

export interface AnalyticsBatchInput {
  installId: string
  events: AnalyticsEventInput[]
}

export function readAnalyticsBatch(value: unknown): AnalyticsBatchInput {
  if (!value || typeof value !== "object") throw new Error("分析事件格式不正确")
  const record = value as Record<string, unknown>
  const installId = typeof record.installId === "string" ? record.installId.trim() : ""
  if (!/^install_[A-Za-z0-9_-]{8,72}$/.test(installId)) throw new Error("安装标识不正确")
  if (!Array.isArray(record.events) || record.events.length < 1 || record.events.length > 20) {
    throw new Error("分析事件数量不正确")
  }
  const events = record.events.map((value): AnalyticsEventInput => {
    if (!value || typeof value !== "object") throw new Error("分析事件格式不正确")
    const item = value as Record<string, unknown>
    const name = typeof item.name === "string" ? item.name.trim() : ""
    if (!EVENT_NAME.test(name)) throw new Error("分析事件名称不正确")
    const path = typeof item.path === "string" ? item.path.trim().slice(0, 120) : ""
    const rawProperties = item.properties && typeof item.properties === "object"
      ? item.properties as Record<string, unknown>
      : {}
    const properties: AnalyticsEventInput["properties"] = {}
    for (const [key, property] of Object.entries(rawProperties)) {
      if (!PROPERTY_KEYS.has(key)) continue
      if (typeof property === "string") properties[key] = property.slice(0, 120)
      if (typeof property === "number" && Number.isFinite(property)) properties[key] = property
      if (typeof property === "boolean") properties[key] = property
    }
    return { name, path, properties }
  })
  return { installId, events }
}

export function recordAnalyticsBatch(
  db: DatabaseSync,
  ownerId: string,
  batch: AnalyticsBatchInput,
  now = Date.now(),
): number {
  const insert = db.prepare(
    `INSERT INTO app_analytics_events
      (id, owner_id, install_id, event_name, path, properties_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
  db.exec("BEGIN")
  try {
    for (const event of batch.events) {
      insert.run(
        randomUUID(),
        ownerId,
        batch.installId,
        event.name,
        event.path,
        JSON.stringify(event.properties),
        now,
      )
    }
    db.exec("COMMIT")
  } catch (error) {
    db.exec("ROLLBACK")
    throw error
  }
  return batch.events.length
}

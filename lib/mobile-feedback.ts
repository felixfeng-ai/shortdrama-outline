import { randomUUID } from "node:crypto"
import type { DatabaseSync } from "node:sqlite"

import { InputError } from "./api.ts"

export const MOBILE_FEEDBACK_CATEGORIES = [
  "agent",
  "voice",
  "video",
  "generation",
  "performance",
  "other",
] as const

export type MobileFeedbackCategory = (typeof MOBILE_FEEDBACK_CATEGORIES)[number]

export interface MobileFeedback {
  id: string
  category: MobileFeedbackCategory
  body: string
  appVersion: string
  buildVersion: string
  platform: string
  osVersion: string
  deviceModel: string
  screen: string
  status: "open"
  createdAt: number
}

interface FeedbackRow {
  id: string
  category: string
  body: string
  app_version: string
  build_version: string
  platform: string
  os_version: string
  device_model: string
  screen: string
  status: string
  created_at: number
}

function text(value: unknown, max: number): string {
  return typeof value === "string"
    ? value.trim().replace(/\s+/g, " ").slice(0, max)
    : ""
}

function rowToFeedback(row: FeedbackRow): MobileFeedback {
  return {
    id: row.id,
    category: row.category as MobileFeedbackCategory,
    body: row.body,
    appVersion: row.app_version,
    buildVersion: row.build_version,
    platform: row.platform,
    osVersion: row.os_version,
    deviceModel: row.device_model,
    screen: row.screen,
    status: "open",
    createdAt: Number(row.created_at),
  }
}

export function readMobileFeedbackInput(value: unknown) {
  const record = value && typeof value === "object"
    ? value as Record<string, unknown>
    : {}
  const category = text(record.category, 24) as MobileFeedbackCategory
  if (!(MOBILE_FEEDBACK_CATEGORIES as readonly string[]).includes(category)) {
    throw new InputError("反馈分类不合法")
  }
  const body = text(record.body, 2_000)
  if (body.length < 5) throw new InputError("反馈正文至少需要 5 个字符")
  return {
    category,
    body,
    appVersion: text(record.appVersion, 32),
    buildVersion: text(record.buildVersion, 32),
    platform: text(record.platform, 24),
    osVersion: text(record.osVersion, 32),
    deviceModel: text(record.deviceModel, 80),
    screen: text(record.screen, 120),
  }
}

export function createMobileFeedback(
  db: DatabaseSync,
  ownerId: string,
  value: unknown,
  now = Date.now(),
): MobileFeedback {
  const input = readMobileFeedbackInput(value)
  const id = `feedback_${randomUUID()}`
  db.prepare(
    `INSERT INTO mobile_feedback
      (id, owner_id, category, body, app_version, build_version, platform,
       os_version, device_model, screen, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)`,
  ).run(
    id,
    ownerId,
    input.category,
    input.body,
    input.appVersion,
    input.buildVersion,
    input.platform,
    input.osVersion,
    input.deviceModel,
    input.screen,
    now,
  )
  return rowToFeedback(
    db.prepare("SELECT * FROM mobile_feedback WHERE id = ?").get(id) as FeedbackRow,
  )
}

export function listMobileFeedback(
  db: DatabaseSync,
  ownerId: string,
): MobileFeedback[] {
  return (db.prepare(
    `SELECT * FROM mobile_feedback
     WHERE owner_id = ?
     ORDER BY created_at DESC
     LIMIT 20`,
  ).all(ownerId) as FeedbackRow[]).map(rowToFeedback)
}

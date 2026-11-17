import { randomUUID } from "node:crypto"
import type { DatabaseSync } from "node:sqlite"

import { InputError } from "./api.ts"

export const WEB_VITAL_NAMES = ["FCP", "LCP", "INP", "CLS", "TTFB"] as const
export type WebVitalName = (typeof WEB_VITAL_NAMES)[number]
export type WebVitalRating = "good" | "needs-improvement" | "poor"
export type WebVitalDevice = "mobile" | "tablet" | "desktop" | "other"

export interface WebVitalEvent {
  name: WebVitalName
  value: number
  rating: WebVitalRating
  path: string
  device: WebVitalDevice
  connection: string
  release: string
}

export interface WebVitalSummary {
  name: WebVitalName
  path: string
  device: WebVitalDevice
  samples: number
  p50: number
  p75: number
  p95: number
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : ""
}

function pathname(value: unknown): string {
  const raw = text(value, 200)
  if (!raw.startsWith("/")) throw new InputError("Web Vitals 路径不合法")
  try {
    return new URL(raw, "https://veyatv.local").pathname.slice(0, 120) || "/"
  } catch {
    throw new InputError("Web Vitals 路径不合法")
  }
}

export function readWebVitalEvent(value: unknown): WebVitalEvent {
  const item = record(value)
  const name = text(item.name, 12).toUpperCase()
  if (!(WEB_VITAL_NAMES as readonly string[]).includes(name)) {
    throw new InputError("Web Vitals 指标不合法")
  }
  const metricValue = Number(item.value)
  if (!Number.isFinite(metricValue) || metricValue < 0 || metricValue > 10_000_000) {
    throw new InputError("Web Vitals 数值不合法")
  }
  const rating = item.rating === "needs-improvement" || item.rating === "poor"
    ? item.rating
    : "good"
  const device = item.device === "mobile"
    || item.device === "tablet"
    || item.device === "desktop"
    ? item.device
    : "other"
  return {
    name: name as WebVitalName,
    value: Math.round(metricValue * 1000) / 1000,
    rating,
    path: pathname(item.path),
    device,
    connection: text(item.connection, 32).toLowerCase(),
    release: text(item.release, 40),
  }
}

export function recordWebVitalEvent(
  db: DatabaseSync,
  ownerId: string,
  event: WebVitalEvent,
  now = Date.now(),
): void {
  db.prepare(
    `INSERT INTO web_vitals_events
      (id, owner_id, metric_name, metric_value, rating, path, device,
       connection_type, release, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(),
    ownerId,
    event.name,
    event.value,
    event.rating,
    event.path,
    event.device,
    event.connection,
    event.release,
    now,
  )
}

function percentile(values: readonly number[], fraction: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((left, right) => left - right)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(fraction * sorted.length) - 1))
  return Math.round(sorted[index] * 100) / 100
}

export function summarizeWebVitals(
  db: DatabaseSync,
  options: { days?: number; now?: number } = {},
): WebVitalSummary[] {
  const days = Math.max(1, Math.min(90, Math.floor(options.days ?? 7)))
  const now = options.now ?? Date.now()
  const rows = db.prepare(
    `SELECT metric_name, path, device, metric_value
     FROM web_vitals_events
     WHERE created_at >= ?
     ORDER BY created_at DESC`,
  ).all(now - days * 86_400_000) as Array<{
    metric_name: string
    path: string
    device: string
    metric_value: number
  }>
  const groups = new Map<string, {
    name: WebVitalName
    path: string
    device: WebVitalDevice
    values: number[]
  }>()
  for (const row of rows) {
    if (!(WEB_VITAL_NAMES as readonly string[]).includes(row.metric_name)) continue
    const name = row.metric_name as WebVitalName
    const device = row.device === "mobile"
      || row.device === "tablet"
      || row.device === "desktop"
      ? row.device
      : "other"
    const key = `${name}\u0000${row.path}\u0000${device}`
    const group = groups.get(key) ?? {
      name,
      path: row.path,
      device,
      values: [],
    }
    group.values.push(Number(row.metric_value))
    groups.set(key, group)
  }
  return [...groups.values()]
    .map((group) => ({
      name: group.name,
      path: group.path,
      device: group.device,
      samples: group.values.length,
      p50: percentile(group.values, 0.5),
      p75: percentile(group.values, 0.75),
      p95: percentile(group.values, 0.95),
    }))
    .sort((left, right) =>
      left.path.localeCompare(right.path)
      || left.name.localeCompare(right.name)
      || left.device.localeCompare(right.device))
}

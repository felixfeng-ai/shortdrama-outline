import { randomUUID } from "node:crypto"
import type { DatabaseSync } from "node:sqlite"

import { InputError } from "../api.ts"
import { getProject } from "./repo.ts"

export const REUSABLE_ASSET_TYPES = ["character", "place", "look"] as const
export type ReusableAssetType = (typeof REUSABLE_ASSET_TYPES)[number]

export interface ReusableAsset {
  id: string
  ownerId: string
  assetType: ReusableAssetType
  name: string
  sourceProjectId: string | null
  sourceAssetId: string
  content: Record<string, unknown>
  version: number
  createdAt: number
  updatedAt: number
}

interface AssetRow {
  id: string
  owner_id: string
  asset_type: string
  name: string
  source_project_id: string | null
  source_asset_id: string
  content_json: string
  version: number
  created_at: number
  updated_at: number
}

const FORBIDDEN_CONTENT_KEYS = new Set([
  "image",
  "imageData",
  "imageUrl",
  "dataUrl",
  "blob",
  "vaultKey",
  "storageKey",
  "localPath",
  "filePath",
])

function text(value: unknown, max: number): string {
  return typeof value === "string"
    ? value.trim().replace(/\s+/g, " ").slice(0, max)
    : ""
}

function sanitizeContent(value: unknown, depth = 0): unknown {
  if (depth > 8) return null
  if (Array.isArray(value)) {
    return value.slice(0, 200).map((item) => sanitizeContent(item, depth + 1))
  }
  if (!value || typeof value !== "object") {
    if (typeof value === "string") return value.slice(0, 20_000)
    if (typeof value === "number" || typeof value === "boolean" || value === null) return value
    return null
  }
  const result: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_CONTENT_KEYS.has(key)) continue
    const cleanKey = text(key, 80)
    if (!cleanKey) continue
    const cleanValue = sanitizeContent(item, depth + 1)
    if (cleanValue !== null) result[cleanKey] = cleanValue
  }
  return result
}

function assetRow(row: AssetRow): ReusableAsset {
  let content: Record<string, unknown> = {}
  try {
    const parsed = JSON.parse(row.content_json)
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      content = parsed as Record<string, unknown>
    }
  } catch {
    content = {}
  }
  return {
    id: row.id,
    ownerId: row.owner_id,
    assetType: row.asset_type as ReusableAssetType,
    name: row.name,
    sourceProjectId: row.source_project_id,
    sourceAssetId: row.source_asset_id,
    content,
    version: Number(row.version),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  }
}

export function listReusableAssets(
  db: DatabaseSync,
  ownerId: string,
  assetType?: ReusableAssetType,
): ReusableAsset[] {
  const rows = assetType
    ? db.prepare(
      `SELECT * FROM reusable_assets
       WHERE owner_id = ? AND asset_type = ?
       ORDER BY updated_at DESC`,
    ).all(ownerId, assetType)
    : db.prepare(
      `SELECT * FROM reusable_assets
       WHERE owner_id = ?
       ORDER BY updated_at DESC`,
    ).all(ownerId)
  return (rows as AssetRow[]).map(assetRow)
}

/**
 * 保存到跨项目库。事务边界覆盖“版本读取 + upsert”，避免并发保存同名资产时
 * 产生两条活动记录或版本跳号。图片和本地路径在进入 JSON 前就被剔除，
 * 因而即使前端误传也不会把隐私数据带到别的项目。
 */
export function saveReusableAsset(
  db: DatabaseSync,
  ownerId: string,
  input: {
    projectId?: unknown
    assetType?: unknown
    name?: unknown
    sourceAssetId?: unknown
    content?: unknown
  },
  now = Date.now(),
): ReusableAsset {
  if (typeof input.assetType !== "string"
    || !(REUSABLE_ASSET_TYPES as readonly string[]).includes(input.assetType)) {
    throw new InputError("资产类型不合法")
  }
  const assetType = input.assetType as ReusableAssetType
  const name = text(input.name, 120)
  if (!name) throw new InputError("资产名称不能为空")
  const projectId = text(input.projectId, 160)
  if (!projectId || !getProject(db, projectId, ownerId)) {
    throw new InputError("来源项目不存在或无权访问")
  }
  const sanitized = sanitizeContent(input.content)
  if (!sanitized || typeof sanitized !== "object" || Array.isArray(sanitized)) {
    throw new InputError("资产内容不能为空")
  }
  const contentJson = JSON.stringify(sanitized)
  if (contentJson.length > 1_000_000) throw new InputError("资产内容过大")
  const sourceAssetId = text(input.sourceAssetId, 160)
  const existing = db.prepare(
    `SELECT * FROM reusable_assets
     WHERE owner_id = ? AND asset_type = ? AND name = ?`,
  ).get(ownerId, assetType, name) as AssetRow | undefined

  db.exec("BEGIN IMMEDIATE")
  try {
    if (existing) {
      db.prepare(
        `UPDATE reusable_assets
         SET source_project_id = ?, source_asset_id = ?, content_json = ?,
             version = ?, updated_at = ?
         WHERE id = ? AND owner_id = ?`,
      ).run(
        projectId,
        sourceAssetId,
        contentJson,
        Number(existing.version) + 1,
        now,
        existing.id,
        ownerId,
      )
    } else {
      const id = `asset_${randomUUID()}`
      db.prepare(
        `INSERT INTO reusable_assets
          (id, owner_id, asset_type, name, source_project_id, source_asset_id,
           content_json, version, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      ).run(id, ownerId, assetType, name, projectId, sourceAssetId, contentJson, now, now)
    }
    db.exec("COMMIT")
  } catch (error) {
    db.exec("ROLLBACK")
    throw error
  }

  const saved = db.prepare(
    `SELECT * FROM reusable_assets
     WHERE owner_id = ? AND asset_type = ? AND name = ?`,
  ).get(ownerId, assetType, name) as AssetRow
  return assetRow(saved)
}

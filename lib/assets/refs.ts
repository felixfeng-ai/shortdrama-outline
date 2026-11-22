// 图台账的读取与映射。
//
// 关键设计（原则 P1）：这里只处理「引用与元数据」，**绝不含图像二进制**。
// refs 表存的是 vaultKey（本地图库里的位置）+ fileHash（校验用），
// 图本身永远在用户机器上。
import type { DatabaseSync } from "node:sqlite"
import type { RefImageMeta } from "./types.ts"
import { InputError } from "../api.ts"

interface RefRow {
  id: string; project_id: string; vault_key: string; label: string
  file_hash: string; mime: string; bytes: number
  owner_type: string; owner_id: string; created_at: number
}

function toRef(row: RefRow): RefImageMeta {
  return {
    id: row.id,
    projectId: row.project_id,
    vaultKey: row.vault_key,
    label: row.label,
    fileHash: row.file_hash,
    mime: row.mime,
    bytes: row.bytes,
    ownerType: row.owner_type as RefImageMeta["ownerType"],
    ownerId: row.owner_id,
    createdAt: row.created_at,
  }
}

export function listRefs(db: DatabaseSync, projectId: string): RefImageMeta[] {
  const rows = db.prepare("SELECT * FROM ref_images WHERE project_id = ? ORDER BY created_at").all(projectId) as RefRow[]
  return rows.map(toRef)
}

export interface RefRelinkUpdate {
  id: string
  vaultKey: string
  fileHash: string
  mime?: string
  bytes?: number
}

/**
 * 原子更新引用位置。
 *
 * 服务端只能相信「文件指纹仍一致」的客户端重关联。任意一条记录不存在、
 * 跨项目或 hash 不匹配，都回滚整批，避免一次扫描只改成功一半，留下半套路径。
 */
export function relinkRefs(
  db: DatabaseSync,
  projectId: string,
  updates: readonly RefRelinkUpdate[],
): { refs: RefImageMeta[]; updated: number } {
  if (updates.length === 0) throw new InputError("没有要恢复的图片引用")

  const stmt = db.prepare(
    "UPDATE ref_images SET vault_key = ?, mime = COALESCE(?, mime), bytes = COALESCE(?, bytes) " +
    "WHERE id = ? AND project_id = ? AND file_hash = ?",
  )

  db.exec("BEGIN")
  try {
    for (const update of updates) {
      const vaultKey = update.vaultKey.trim()
      const fileHash = update.fileHash.trim()
      if (!update.id || !vaultKey || !fileHash) {
        throw new InputError("引用恢复参数不完整")
      }
      const result = stmt.run(
        vaultKey,
        typeof update.mime === "string" ? update.mime : null,
        Number.isFinite(update.bytes) ? update.bytes : null,
        update.id,
        projectId,
        fileHash,
      ) as { changes?: number }
      if (Number(result.changes ?? 0) !== 1) {
        throw new InputError("引用不存在、跨项目或文件指纹不一致")
      }
    }
    db.exec("COMMIT")
  } catch (error) {
    db.exec("ROLLBACK")
    throw error
  }
  return { refs: listRefs(db, projectId), updated: updates.length }
}

/**
 * 构建「角色名 -> 该角色参考图标签」的映射，供 normalizeShots 标注本镜该带哪几张图。
 * 只有 ownerType = 'character' 的记录参与——镜头图不用于跨镜一致性。
 */
export function buildRefMap(db: DatabaseSync, projectId: string | null): Map<string, string[]> {
  const map = new Map<string, string[]>()
  if (!projectId) return map

  try {
    const rows = db.prepare(
      "SELECT owner_id, label FROM ref_images WHERE project_id = ? AND owner_type = 'character' ORDER BY created_at",
    ).all(projectId) as { owner_id: string; label: string }[]

    for (const { owner_id, label } of rows) {
      const list = map.get(owner_id) ?? []
      list.push(label)
      map.set(owner_id, list)
    }
  } catch (error) {
    // 台账读不到不应该阻断生成，只是少了参考图标注
    console.error("[assets] 读取图台账失败（不影响生成）", error)
  }
  return map
}

/**
 * 「地点名 -> 该地点场景图标签」的映射。
 *
 * 和角色图分开取，是因为它们的挂法不同：角色图按 `characters` 数组逐个匹配，
 * 地点图按 `Shot.place` 匹配一次。混在一张表里会让调用方分不清哪个是哪个。
 */
export function buildPlaceRefMap(db: DatabaseSync, projectId: string | null): Map<string, string[]> {
  const map = new Map<string, string[]>()
  if (!projectId) return map

  try {
    const rows = db.prepare(
      "SELECT owner_id, label FROM ref_images WHERE project_id = ? AND owner_type = 'place' ORDER BY created_at",
    ).all(projectId) as { owner_id: string; label: string }[]

    for (const { owner_id, label } of rows) {
      const list = map.get(owner_id) ?? []
      list.push(label)
      map.set(owner_id, list)
    }
  } catch (error) {
    // 台账读不到不应该阻断生成，只是少了场景图标注
    console.error("[assets] 读取场景图台账失败（不影响生成）", error)
  }
  return map
}

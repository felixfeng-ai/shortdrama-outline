// 图台账的读取与映射。
//
// 关键设计（原则 P1）：这里只处理「引用与元数据」，**绝不含图像二进制**。
// refs 表存的是 vaultKey（本地图库里的位置）+ fileHash（校验用），
// 图本身永远在用户机器上。
import type { DatabaseSync } from "node:sqlite"
import type { RefImageMeta } from "./types.ts"

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

// 血缘图查询：过期判定与影响范围。
//
// 这两个能力是护城河的核心（SDD v0.2 §4.1 A2/A3）：
//   - isStale：下游快照记录的父快照，是否还是该 kind 的最新版
//   - findImpact：沿血缘反向遍历，找出所有（多层）受影响的下游快照
//
// 与旧实现的区别：旧代码用 JSON.stringify 整份内容的 hash 比较
// （page.tsx 的 charactersSig），一旦序列化顺序变化就会误判，
// 且无法回答「到底是谁变了」。这里改成比较快照 id。
import type { DatabaseSync } from "node:sqlite"
import type { ArtifactKind, Snapshot } from "./repo.ts"
import { latestSnapshot } from "./repo.ts"

/**
 * 快照是否过期：其任一父快照，已经不是对应 kind 的最新版。
 * 没有父快照（如第一步的 characters）永远不算过期。
 */
export function isStale(db: DatabaseSync, snapshot: Snapshot): boolean {
  for (const parentId of snapshot.parents) {
    const parent = db.prepare("SELECT * FROM snapshots WHERE id = ?").get(parentId) as
      | { project_id: string; kind: string }
      | undefined
    if (!parent) continue

    const latest = latestSnapshot(db, parent.project_id, parent.kind as ArtifactKind)
    if (latest && latest.id !== parentId) return true
  }
  return false
}

/** 过期的原因（给界面展示用）。不过期时返回 null */
export function staleReason(db: DatabaseSync, snapshot: Snapshot): string | null {
  for (const parentId of snapshot.parents) {
    const parent = db.prepare("SELECT * FROM snapshots WHERE id = ?").get(parentId) as
      | { project_id: string; kind: string; version: number }
      | undefined
    if (!parent) continue

    const latest = latestSnapshot(db, parent.project_id, parent.kind as ArtifactKind)
    if (latest && latest.id !== parentId) {
      return `${parent.kind} 已更新到 v${latest.version}（本版基于 v${parent.version}）`
    }
  }
  return null
}

interface SnapshotRow {
  id: string; project_id: string; kind: string; version: number
  payload: string; created_at: number
}

/**
 * 影响范围：给定一个快照，返回所有（含多层）依赖它的下游快照。
 *
 * 用 BFS 沿 lineage 的 to -> from 方向反向遍历。用 visited 集合防止
 * 环形依赖导致死循环（血缘理论上是 DAG，但数据异常时不能挂死）。
 */
export function findImpact(db: DatabaseSync, snapshotId: string): Snapshot[] {
  const children = db.prepare(
    "SELECT from_snapshot_id FROM lineage WHERE to_snapshot_id = ?",
  )
  const getRow = db.prepare("SELECT * FROM snapshots WHERE id = ?")

  const visited = new Set<string>([snapshotId])
  const queue = [snapshotId]
  const result: Snapshot[] = []

  while (queue.length > 0) {
    const current = queue.shift()!
    const rows = children.all(current) as { from_snapshot_id: string }[]
    for (const { from_snapshot_id } of rows) {
      if (visited.has(from_snapshot_id)) continue
      visited.add(from_snapshot_id)
      queue.push(from_snapshot_id)

      const row = getRow.get(from_snapshot_id) as SnapshotRow | undefined
      if (!row) continue
      result.push({
        id: row.id,
        projectId: row.project_id,
        kind: row.kind as ArtifactKind,
        version: row.version,
        payload: JSON.parse(row.payload),
        parents: [],
        createdAt: row.created_at,
      })
    }
  }

  return result
}

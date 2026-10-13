// 快照持久化的共用逻辑。
//
// 为什么单独抽出来：三个「生成」路由（visual / scenes / shots）都要做同一件事——
// 「有 projectId 就落快照并连血缘，没有就当匿名使用」。
// 而且落快照失败绝不能影响生成结果本身（SDD v0.2 F3：降级不阻断）。
import type { DatabaseSync } from "node:sqlite"
import { createSnapshot, latestSnapshot, type ArtifactKind } from "./repo.ts"
import type { Snapshot } from "./repo.ts"

/**
 * 把一次生成的结果落成快照，并连好血缘。
 *
 * @param kinds 上游 kind 列表：会把每个 kind 的「最新快照」id 记为本快照的 parents。
 *              这些正是判断「过期」的依据。
 * @returns 新快照；未提供 projectId 或落库失败时返回 null（不抛异常）
 */
export function persistIfProject(
  db: DatabaseSync,
  projectId: string | null | undefined,
  kind: ArtifactKind,
  payload: unknown,
  opts: { kinds: ArtifactKind[] } = { kinds: [] },
): Snapshot | null {
  if (!projectId) return null
  try {
    const parents: string[] = []
    for (const upstream of opts.kinds) {
      const latest = latestSnapshot(db, projectId, upstream)
      if (latest) parents.push(latest.id)
    }
    return createSnapshot(db, { projectId, kind, payload, parents })
  } catch (error) {
    // 落库是增强能力，失败不应该让用户拿不到刚生成的内容
    console.error("[assets] 快照落库失败（生成结果不受影响）", error)
    return null
  }
}

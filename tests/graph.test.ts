// 阶段 2：过期判定（A2）与影响范围（A3）。
//
// 这两个能力是「护城河」的核心：改一处、能算出影响了谁，
// 且不静默覆盖用户已经改过的内容（原则 P3）。
import { test } from "node:test"
import assert from "node:assert/strict"

import { openDb } from "../lib/assets/db.ts"
import { createProject, createSnapshot } from "../lib/assets/repo.ts"
import { isStale, staleReason, findImpact } from "../lib/assets/graph.ts"

function tmpDbPath(tag: string): string {
  return `${process.env.CHENGJU_DATA_DIR}/t-${tag}-${process.pid}-${Date.now()}.db`
}

// ── Capability A2：上游变更 → 下游标记过期（不静默清空）────────────

test("A2 上游变更后，下游快照被标记为过期", () => {
  const db = openDb(tmpDbPath("a2"))
  const p = createProject(db, "测试剧")

  const c1 = createSnapshot(db, { projectId: p.id, kind: "characters", payload: [{ name: "张三" }] })
  const a1 = createSnapshot(db, { projectId: p.id, kind: "acts", payload: [{ key: "setup" }], parents: [c1.id] })

  // 此时 characters 最新就是 c1，a1 不算过期
  assert.equal(isStale(db, a1), false)

  // 改角色 → 产出 c2
  createSnapshot(db, { projectId: p.id, kind: "characters", payload: [{ name: "张三", arc: "黑化" }] })

  assert.equal(isStale(db, a1), true)
  assert.match(staleReason(db, a1)!, /characters/)
})

test("A2b 过期不静默清空：下游 payload 原样保留", () => {
  const db = openDb(tmpDbPath("a2b"))
  const p = createProject(db, "测试剧")

  const c1 = createSnapshot(db, { projectId: p.id, kind: "characters", payload: [{ name: "张三" }] })
  const originalActs = [{ key: "setup", summary: "用户手改过的内容" }]
  const a1 = createSnapshot(db, { projectId: p.id, kind: "acts", payload: originalActs, parents: [c1.id] })

  createSnapshot(db, { projectId: p.id, kind: "characters", payload: [{ name: "李四" }] })

  assert.equal(isStale(db, a1), true)
  assert.deepEqual(a1.payload, originalActs)
})

test("A2c 重新生成下游后，过期状态消失", () => {
  const db = openDb(tmpDbPath("a2c"))
  const p = createProject(db, "测试剧")

  const c1 = createSnapshot(db, { projectId: p.id, kind: "characters", payload: [{ name: "张三" }] })
  const a1 = createSnapshot(db, { projectId: p.id, kind: "acts", payload: [], parents: [c1.id] })
  const c2 = createSnapshot(db, { projectId: p.id, kind: "characters", payload: [{ name: "王五" }] })

  assert.equal(isStale(db, a1), true)

  const a2 = createSnapshot(db, { projectId: p.id, kind: "acts", payload: [], parents: [c2.id] })
  assert.equal(isStale(db, a2), false)
})

// ── Capability A3：影响范围可查询 ────────────────────────────────

test("A3 查询某个角色的锚点变更影响了哪些下游快照", () => {
  const db = openDb(tmpDbPath("a3"))
  const p = createProject(db, "测试剧")

  const c1 = createSnapshot(db, { projectId: p.id, kind: "characters", payload: [{ name: "张三" }] })
  const a1 = createSnapshot(db, { projectId: p.id, kind: "acts", payload: [], parents: [c1.id] })
  const e1 = createSnapshot(db, { projectId: p.id, kind: "episodes", payload: [], parents: [c1.id, a1.id] })

  const impact = findImpact(db, c1.id)

  assert.deepEqual(impact.map((s) => s.id).sort(), [a1.id, e1.id].sort())
})

test("A3b 影响范围是多层的：隔一层也算受影响", () => {
  const db = openDb(tmpDbPath("a3b"))
  const p = createProject(db, "测试剧")

  const c1 = createSnapshot(db, { projectId: p.id, kind: "characters", payload: [{ name: "张三" }] })
  const a1 = createSnapshot(db, { projectId: p.id, kind: "acts", payload: [], parents: [c1.id] })
  const e1 = createSnapshot(db, { projectId: p.id, kind: "episodes", payload: [], parents: [a1.id] })
  const s1 = createSnapshot(db, { projectId: p.id, kind: "shots", payload: [], parents: [e1.id] })

  const impact = findImpact(db, c1.id)
  assert.deepEqual(impact.map((s) => s.id).sort(), [a1.id, e1.id, s1.id].sort())
})

test("A3c 影响范围不会误伤：不相关的分支不算", () => {
  const db = openDb(tmpDbPath("a3c"))
  const p = createProject(db, "测试剧")

  const c1 = createSnapshot(db, { projectId: p.id, kind: "characters", payload: [], parents: [] })
  const other = createSnapshot(db, { projectId: p.id, kind: "characters", payload: [], parents: [] })
  const a1 = createSnapshot(db, { projectId: p.id, kind: "acts", payload: [], parents: [c1.id] })
  createSnapshot(db, { projectId: p.id, kind: "acts", payload: [], parents: [other.id] })

  const impact = findImpact(db, c1.id)
  assert.deepEqual(impact.map((s) => s.id), [a1.id])
})

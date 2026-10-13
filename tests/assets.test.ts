import { test } from "node:test"
import assert from "node:assert/strict"

import { openDb, getDataDir } from "../lib/assets/db.ts"
import { createProject, createSnapshot, listSnapshots, getSnapshot } from "../lib/assets/repo.ts"

/** 每组用独立的临时库，避免相互污染 */
function tmpDbPath(tag: string): string {
  // 走业务侧的 getDataDir()，不要自己读环境变量：
  // 子进程里变量可能是空的，那会直接拼出一个 undefined/ 目录（见 db.ts 注释）。
  // 再统一收进 tmp/ 子目录，跑完由测试自己删掉，绝不污染真实资产库。
  return `${getDataDir()}/tmp/test-${tag}-${process.pid}-${Date.now()}.db`
}

// ── Capability A：资产链 ─────────────────────────────────────────

test("A1 血缘自动建立：下游快照的 parents 指向上游快照 id", () => {
  const db = openDb(tmpDbPath("a1"))
  const p = createProject(db, "测试剧")

  const c1 = createSnapshot(db, { projectId: p.id, kind: "characters", payload: [{ name: "张三" }], parents: [] })
  const a1 = createSnapshot(db, { projectId: p.id, kind: "acts", payload: [{ key: "setup" }], parents: [c1.id] })

  assert.equal(a1.version, 1)
  assert.deepEqual(a1.parents, [c1.id])
})

test("A4 版本递增与回溯：同 kind 逐次 +1，旧版仍可读", () => {
  const db = openDb(tmpDbPath("a4"))
  const p = createProject(db, "测试剧")

  const v1 = createSnapshot(db, { projectId: p.id, kind: "shots", payload: [{ shot: 1 }], parents: [] })
  const v2 = createSnapshot(db, { projectId: p.id, kind: "shots", payload: [{ shot: 1 }, { shot: 2 }], parents: [] })

  assert.equal(v1.version, 1)
  assert.equal(v2.version, 2)

  const list = listSnapshots(db, p.id, "shots")
  assert.deepEqual(list.map((s) => s.version), [2, 1])
  assert.deepEqual(getSnapshot(db, v1.id)!.payload, [{ shot: 1 }])
})

test("A1b parents 必须是真实存在的快照 id（外键约束）", () => {
  const db = openDb(tmpDbPath("a1b"))
  const p = createProject(db, "测试剧")
  assert.throws(() => createSnapshot(db, { projectId: p.id, kind: "acts", payload: [], parents: ["not-exist"] }))
})

test("A4b 快照按 project 隔离，不同项目的版本号互不影响", () => {
  const db = openDb(tmpDbPath("a4b"))
  const p1 = createProject(db, "剧一")
  const p2 = createProject(db, "剧二")

  createSnapshot(db, { projectId: p1.id, kind: "shots", payload: [], parents: [] })
  const p2v1 = createSnapshot(db, { projectId: p2.id, kind: "shots", payload: [], parents: [] })

  assert.equal(p2v1.version, 1)
})

// ── Capability F：持久化健壮性 ───────────────────────────────────

test("F1 落盘存活：重开同一个库文件，数据仍在", () => {
  const path = tmpDbPath("f1")
  const db1 = openDb(path)
  const p = createProject(db1, "持久化测试")
  createSnapshot(db1, { projectId: p.id, kind: "characters", payload: [{ name: "李四" }], parents: [] })
  db1.close()

  const db2 = openDb(path)
  const list = listSnapshots(db2, p.id, "characters")
  assert.equal(list.length, 1)
  assert.deepEqual(list[0].payload, [{ name: "李四" }])
  db2.close()
})

test("F4 建表幂等：同一个库重复 openDb 不报错", () => {
  const path = tmpDbPath("f4")
  openDb(path).close()
  const db = openDb(path)
  const p = createProject(db, "幂等测试")
  assert.ok(p.id)
  db.close()
})

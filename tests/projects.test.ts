import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

import { openDb, getDataDir } from "../lib/assets/db.ts"
import {
  createProject,
  createSnapshot,
  deleteProject,
  listProjects,
  listSnapshots,
  renameProject,
} from "../lib/assets/repo.ts"

function tmpDbPath(tag: string): string {
  return `${getDataDir()}/tmp/test-${tag}-${process.pid}-${Date.now()}.db`
}

// ── P1 重命名 ──
//
// 以前项目名是「想法前 20 字」自动取的，改不了。用户写第二部戏时，
// 项目列表里会躺着一堆「一个快递员意外继承…」，根本分不出谁是谁。

test("P1 重命名改的是显示名，不动快照内容", () => {
  const db = openDb(tmpDbPath("p1"))
  const p = createProject(db, "一个快递员意外继承了百万遗产")
  const snap = createSnapshot(db, { projectId: p.id, kind: "characters", payload: [{ name: "陈默" }], parents: [] })

  const renamed = renameProject(db, p.id, "  遗产 · v2  ")
  assert.equal(renamed?.title, "遗产 · v2", "首尾空格要去掉")
  assert.ok((renamed?.updatedAt ?? 0) >= p.updatedAt, "改名要顺带刷新 updatedAt，列表才排得对")
  assert.deepEqual(listSnapshots(db, p.id, "characters")[0].payload, [{ name: "陈默" }])
  assert.equal(listSnapshots(db, p.id, "characters")[0].id, snap.id)
})

test("P1b 空名字与不存在的项目都返回 null，不抛异常", () => {
  const db = openDb(tmpDbPath("p1b"))
  const p = createProject(db, "原名")
  assert.equal(renameProject(db, p.id, "   "), null)
  assert.equal(renameProject(db, "no-such-id", "新名"), null)
  assert.equal(listProjects(db)[0].title, "原名", "被拒绝的改名不能生效")
})

// ── P2 删除要删干净 ──
//
// 表上都写了 ON DELETE CASCADE，但这条链一旦哪天真断了（比如有人
// 关掉 foreign_keys），库里会慢慢攒一堆孤儿快照——这条测试就是那道闸。

test("P2 删项目会连快照、血缘、图台账一起清掉", () => {
  const db = openDb(tmpDbPath("p2"))
  const p = createProject(db, "要删的项目")
  const c1 = createSnapshot(db, { projectId: p.id, kind: "characters", payload: [{ name: "张三" }], parents: [] })
  const s1 = createSnapshot(db, { projectId: p.id, kind: "shots", payload: [{ shot: 1 }], parents: [c1.id] })

  // 图台账用原始 SQL 塞一行：这里验的是级联，不是登记接口
  db.prepare(
    "INSERT INTO ref_images (id, project_id, vault_key, label, file_hash, mime, bytes, owner_type, owner_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).run("r1", p.id, "张三/正面.png", "正面", "h", "image/png", 1, "character", "c1", Date.now())

  assert.equal(deleteProject(db, p.id), true)

  assert.equal(listProjects(db).length, 0, "项目没了")
  assert.equal(listSnapshots(db, p.id, "characters").length, 0, "快照没了")
  assert.equal(listSnapshots(db, p.id, "shots").length, 0)
  const lineage = db.prepare("SELECT COUNT(*) AS n FROM lineage WHERE from_snapshot_id = ? OR to_snapshot_id = ?").get(s1.id, s1.id) as { n: number }
  assert.equal(lineage.n, 0, "血缘记录没了，不能留悬空引用")
  const refs = db.prepare("SELECT COUNT(*) AS n FROM ref_images WHERE project_id = ?").get(p.id) as { n: number }
  assert.equal(refs.n, 0, "图台账没了")
})

test("P2b 删一个项目不影响另一个项目", () => {
  const db = openDb(tmpDbPath("p2b"))
  const keep = createProject(db, "留下的")
  const drop = createProject(db, "删掉的")
  createSnapshot(db, { projectId: keep.id, kind: "characters", payload: [{ name: "留" }], parents: [] })
  createSnapshot(db, { projectId: drop.id, kind: "characters", payload: [{ name: "删" }], parents: [] })

  assert.equal(deleteProject(db, drop.id), true)
  assert.equal(deleteProject(db, drop.id), false, "重复删除返回 false，不抛")
  assert.deepEqual(listProjects(db).map((p) => p.title), ["留下的"])
  assert.equal(listSnapshots(db, keep.id, "characters").length, 1)
})

// ── P3 界面与接口的接点 ──

test("P3 项目接口支持改名与删除，界面也接上了", () => {
  const route = fs.readFileSync("app/api/projects/route.ts", "utf8")
  assert.ok(route.includes("export async function PATCH"), "缺改名接口")
  assert.ok(route.includes("export async function DELETE"), "缺删除接口")

  const page = fs.readFileSync("app/page.tsx", "utf8")
  assert.ok(page.includes("<ProjectBar"), "项目条没挂到页面上")
  assert.ok(page.includes("clearWorkspace()"), "换项目必须清空六步，避免上一部戏的数据串到下一部")
  assert.ok(page.includes("void refreshProjects()"), "新建项目后要刷新列表")
})

// 阶段 2 的接口层：项目 / 快照 / 影响范围三个 route。
//
// 直接调用 route 的导出函数（不启 HTTP 服务），验证契约与 SDD §5.1 一致。
import { test } from "node:test"
import assert from "node:assert/strict"

import { GET as getProjects, POST as postProject } from "../app/api/projects/route.ts"
import { GET as getSnapshots } from "../app/api/snapshots/route.ts"
import { GET as getImpact } from "../app/api/impact/route.ts"
import { getDbForRequest, __resetDbForTests } from "../lib/assets/store.ts"
import { createSnapshot } from "../lib/assets/repo.ts"

function json(body: unknown): Request {
  return new Request("http://localhost/api/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

function get(url: string): Request {
  return new Request(url, { method: "GET" })
}

test("POST /api/projects 创建项目，返回统一信封", async () => {
  __resetDbForTests(":memory:")
  const res = await postProject(json({ title: "我的漫剧" }))
  const payload = await res.json()

  assert.equal(res.status, 200)
  assert.equal(payload.success, true)
  assert.equal(payload.error, null)
  assert.equal(payload.data.project.title, "我的漫剧")
  assert.ok(payload.data.project.id)
})

test("POST /api/projects 标题为空时返回 400 + 中文文案", async () => {
  __resetDbForTests(":memory:")
  const res = await postProject(json({ title: "   " }))
  const payload = await res.json()

  assert.equal(res.status, 400)
  assert.equal(payload.success, false)
  assert.ok(payload.error.length > 0)
})

test("GET /api/projects 按更新时间倒序返回列表", async () => {
  __resetDbForTests(":memory:")
  await postProject(json({ title: "剧一" }))
  // 等 2ms，避免两次创建落在同一毫秒导致排序不确定
  await new Promise((r) => setTimeout(r, 2))
  await postProject(json({ title: "剧二" }))

  const res = await getProjects()
  const payload = await res.json()
  const titles = payload.data.projects.map((p: { title: string }) => p.title)

  // 后创建的 updated_at 更晚，应排在前面
  assert.deepEqual(titles, ["剧二", "剧一"])
})

test("GET /api/snapshots 按 kind 返回版本倒序列表", async () => {
  __resetDbForTests(":memory:")
  const created = await (await postProject(json({ title: "剧" }))).json()
  const projectId = created.data.project.id
  const db = getDbForRequest()

  createSnapshot(db, { projectId, kind: "shots", payload: [{ shot: 1 }] })
  createSnapshot(db, { projectId, kind: "shots", payload: [{ shot: 1 }, { shot: 2 }] })

  const res = await getSnapshots(get(`http://localhost/api/snapshots?projectId=${projectId}&kind=shots`))
  const payload = await res.json()

  assert.equal(payload.success, true)
  assert.deepEqual(payload.data.snapshots.map((s: { version: number }) => s.version), [2, 1])
})

test("GET /api/snapshots 缺参数时返回 400", async () => {
  __resetDbForTests(":memory:")
  const res = await getSnapshots(get("http://localhost/api/snapshots"))
  assert.equal(res.status, 400)
})

test("GET /api/impact 返回受影响的下游快照", async () => {
  __resetDbForTests(":memory:")
  const created = await (await postProject(json({ title: "剧" }))).json()
  const projectId = created.data.project.id
  const db = getDbForRequest()

  const c1 = createSnapshot(db, { projectId, kind: "characters", payload: [{ name: "张三" }] })
  const a1 = createSnapshot(db, { projectId, kind: "acts", payload: [], parents: [c1.id] })

  const res = await getImpact(get(`http://localhost/api/impact?snapshotId=${c1.id}`))
  const payload = await res.json()

  assert.deepEqual(payload.data.affected.map((s: { id: string }) => s.id), [a1.id])
})

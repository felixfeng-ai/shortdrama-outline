import { test } from "node:test"
import assert from "node:assert/strict"

import { GET as exportGet } from "../app/api/export/route.ts"
import { shotsToCsv as buildPromptsCsv } from "../lib/assets/export.ts"
import { POST as postRefs, GET as getRefs } from "../app/api/refs/route.ts"
import { POST as postProject } from "../app/api/projects/route.ts"
import { getDbForRequest, __resetDbForTests } from "../lib/assets/store.ts"
import { createSnapshot } from "../lib/assets/repo.ts"
import { buildRefMap } from "../lib/assets/refs.ts"
import type { Shot } from "../lib/assets/types.ts"

function json(body: unknown): Request {
  return new Request("http://localhost/api/x", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

async function newProject(title = "剧") {
  __resetDbForTests(":memory:")
  const res = await postProject(json({ title }))
  const payload = await res.json()
  return payload.data.project.id as string
}

// ── Capability C：图台账（P1 的落点）────────────────────────────

test("C3 登记图片引用并计算台账，服务端不含二进制", async () => {
  const projectId = await newProject()
  const res = await postRefs(json({
    projectId,
    refs: [{
      vaultKey: "characters/zhangsan/front.png",
      label: "定妆正面",
      fileHash: "a".repeat(64),
      mime: "image/png",
      bytes: 12345,
      ownerType: "character",
      ownerId: "张三",
    }],
  }))
  const payload = await res.json()

  assert.equal(payload.success, true)
  assert.equal(payload.data.refs.length, 1)
  assert.equal(payload.data.refs[0].fileHash, "a".repeat(64))
})

test("C3b ★P1 强制点：携带二进制内容的请求被拒绝", async () => {
  const projectId = await newProject()
  const res = await postRefs(json({
    projectId,
    refs: [{ vaultKey: "x.png", fileHash: "h", ownerId: "张三", data: "BASE64PIXELS" }],
  }))
  const payload = await res.json()

  assert.equal(res.status, 400)
  assert.equal(payload.success, false)
  assert.match(payload.error, /不接受图片内容/)
})

test("C3c 缺 fileHash 时拒绝（没有指纹就无法检测图被替换）", async () => {
  const projectId = await newProject()
  const res = await postRefs(json({
    projectId,
    refs: [{ vaultKey: "x.png", ownerId: "张三" }],
  }))
  assert.equal(res.status, 400)
})

test("B6d buildRefMap：只把角色图纳入映射，镜头图不参与一致性", async () => {
  const projectId = await newProject()
  const db = getDbForRequest()
  await postRefs(json({
    projectId,
    refs: [
      { vaultKey: "a.png", label: "定妆正面", fileHash: "h1", ownerType: "character", ownerId: "张三" },
      { vaultKey: "b.png", label: "侧脸", fileHash: "h2", ownerType: "character", ownerId: "张三" },
      { vaultKey: "c.png", label: "镜1图", fileHash: "h3", ownerType: "shot", ownerId: "shot-e-0" },
    ],
  }))

  const map = buildRefMap(db, projectId)
  assert.deepEqual(map.get("张三"), ["定妆正面", "侧脸"])
  assert.equal(map.has("shot-e-0"), false)
})

test("C3d GET /api/refs 返回该项目台账", async () => {
  const projectId = await newProject()
  await postRefs(json({
    projectId,
    refs: [{ vaultKey: "a.png", label: "图", fileHash: "h", ownerType: "character", ownerId: "张三" }],
  }))
  const payload = await (await getRefs(new Request(`http://localhost/api/refs?projectId=${projectId}`))).json()
  assert.equal(payload.data.refs.length, 1)
})

test("P1 台账表结构里没有任何二进制列", async () => {
  await newProject()
  const db = getDbForRequest()
  const cols = db.prepare("PRAGMA table_info(ref_images)").all() as { name: string }[]
  const names = cols.map((c) => c.name)
  for (const forbidden of ["data", "blob", "content", "image"]) {
    assert.ok(!names.includes(forbidden), `台账表不应有 ${forbidden} 列`)
  }
})

// ── Capability E：打包带走（P2 的落点）──────────────────────────

test("E1 导出自包含清单：含项目、各类最新版、图台账元数据", async () => {
  const projectId = await newProject("导出测试")
  const db = getDbForRequest()
  createSnapshot(db, { projectId, kind: "shots", payload: [{ shot: 1 }] })

  const payload = await (await exportGet(new Request(`http://localhost/api/export?projectId=${projectId}`))).json()

  assert.equal(payload.success, true)
  assert.equal(payload.data.manifest.project.title, "导出测试")
  assert.equal(payload.data.manifest.latest.shots.version, 1)
  assert.ok(Array.isArray(payload.data.manifest.refs))
})

test("E2 导出缺 projectId 时返回 400", async () => {
  await newProject()
  const res = await exportGet(new Request("http://localhost/api/export"))
  assert.equal(res.status, 400)
})

test("E3 prompts.csv：含表头与全部镜头，可离线使用", () => {
  const shots: Shot[] = [{
    id: "s1", entityId: "e1", shot: 1, scene: "咖啡馆", characters: ["张三"], action: "推门",
    camera: "中景", prompt: "a man, wearing: 沙色短夹克", refImages: ["张三·定妆正面"],
    missingRefFor: [], params: { ratio: "9:16", duration: 5, lastFrame: false }, status: "todo",
  }]
  const csv = buildPromptsCsv(shots)
  assert.ok(csv.includes("镜号"))
  assert.ok(csv.includes("沙色短夹克"))
  assert.ok(csv.includes("9:16"), "CSV 里应含竖屏比例")
  assert.equal(csv.split("\n").length >= 3, true)
})

test("E3b CSV 转义：提示词里的引号不会破坏列结构", () => {
  const shots: Shot[] = [{
    id: "s1", entityId: "e1", shot: 1, scene: "s", characters: [], action: "",
    camera: "中景", prompt: 'a man saying "hello"', refImages: [], missingRefFor: [],
    params: { ratio: "9:16", duration: 5, lastFrame: false }, status: "todo",
  }]
  const csv = buildPromptsCsv(shots)
  assert.ok(csv.includes('""hello""'))
})

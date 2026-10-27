import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

import { buildZip } from "../lib/assets/export.ts"
import { readStoreZip } from "../lib/archive/zip.ts"
import { parseProjectPackage } from "../lib/export/import.ts"
import { POST as importProjectPackage } from "../app/api/project-import/route.ts"
import { __resetDbForTests, getDbForRequest } from "../lib/assets/store.ts"
import { listSnapshots } from "../lib/assets/repo.ts"
import { listGeneratedAssets, listGenerationTasks } from "../lib/generation/repo.ts"
import { buildProjectPackageManifest } from "../lib/export/package.ts"

const OWNER = `anon_${"i".repeat(48)}`
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x02])

function packageManifest() {
  return buildProjectPackageManifest({
    project: { id: "old-project", title: "可导入项目", createdAt: 1, updatedAt: 2 },
    mode: "backup",
    exportedAt: 999,
    projectSettings: {
      genre: "悬疑",
      episodeCount: 1,
      brief: { emotion: "克制", audience: "", references: "", redline: "" },
      look: { palette: "冷蓝", light: "", lens: "", banned: "" },
      judgments: [{ id: "j1", at: 1, step: "manual", action: "手记", reason: "保留结尾留白" }],
    },
    story: {
      idea: "一个快递员发现秘密",
      characters: [{ id: "c1", name: "林远", identity: "快递员", personality: "克制", motivation: "查明真相", arc: "从逃避到承担" }],
      acts: [],
      episodes: [{ number: 1, title: "最后一单", synopsis: "发现包裹", hook: "门后有人" }],
    },
    assets: {
      visuals: [{ id: "v1", entityId: "c1", name: "林远", age: "28", face: "", hair: "", marks: "", wardrobe: "", props: "", anchor: "" }],
      places: [],
      scenes: [],
      shots: [],
    },
    refs: [],
    keyframes: [],
    tasks: [],
    snapshots: [],
    files: [],
    warnings: [],
  })
}

test("IMPORT-V2.1 ZIP 读取能往返中文路径并拒绝路径穿越", async () => {
  const enc = new TextEncoder()
  const zip = buildZip([
    { name: "project.json", data: enc.encode('{"ok":true}') },
    { name: "generated/selected/characters/林远/定妆图.png", data: PNG },
  ])
  const entries = await readStoreZip(zip)
  assert.equal(new TextDecoder().decode(entries.get("project.json")), '{"ok":true}')
  assert.ok(entries.has("generated/selected/characters/林远/定妆图.png"))

  const bad = buildZip([{ name: "../secret.txt", data: enc.encode("x") }])
  await assert.rejects(() => readStoreZip(bad), /路径非法/)
})

test("IMPORT-V2.2 解析器拒绝未知 schema 与错误版本", async () => {
  assert.throws(() => parseProjectPackage({ schema: "other", schemaVersion: 2 }), /格式不正确/)
  assert.throws(
    () => parseProjectPackage({ schema: "chengju.project", schemaVersion: 1 }),
    /不支持.*版本/,
  )
})

test("IMPORT-V2.3 服务端导入创建新项目、最新快照与独立身份", async () => {
  __resetDbForTests(":memory:")
  const db = getDbForRequest()
  const form = new FormData()
  form.set("manifest", JSON.stringify(packageManifest()))
  const response = await importProjectPackage(new Request("http://localhost/api/project-import", {
    method: "POST",
    headers: new Headers({ cookie: `chengju_sid=${OWNER}` }),
    body: form,
  }))
  const payload = await response.json()

  assert.equal(response.status, 200, payload.error)
  const projectId = payload.data.project.id as string
  assert.notEqual(projectId, "old-project")
  assert.equal(payload.data.project.title, "可导入项目")
  const characters = listSnapshots(db, projectId, "characters")[0].payload as Array<{ name: string }>
  const visuals = listSnapshots(db, projectId, "visualCharacters")[0].payload as Array<{ anchor: string }>
  assert.equal(characters[0].name, "林远")
  assert.equal(visuals[0].anchor, "")
  assert.equal(listGenerationTasks(db, projectId).length, 0)
  assert.equal(listGeneratedAssets(db, projectId).length, 0)
})

test("IMPORT-V2.4 服务端恢复生成图、任务和采用状态", async () => {
  __resetDbForTests(":memory:")
  const db = getDbForRequest()
  const manifest = packageManifest() as ReturnType<typeof packageManifest> & {
    assets: { shots: unknown[] }
    keyframes: Array<Record<string, unknown>>
  }
  manifest.assets.shots.push({
    id: "s1", entityId: "shot-entity-1", shot: 1, episode: 1, scene: "门后", characters: [],
    action: "", speaker: "", dialogue: "", place: "", shotSize: "中景", camera: "固定", prompt: "door",
    refImages: [], missingRefFor: [], params: { ratio: "9:16", duration: 10, lastFrame: false }, status: "todo",
  })
  manifest.keyframes.push({
    id: "old-asset",
    taskId: "old-task",
    targetType: "shot",
    targetId: "shot-entity-1",
    mime: "image/png",
    bytes: PNG.length,
    providerId: "aliyun",
    model: "wanx2.1-t2i-turbo",
    prompt: "door",
    selectedAt: 123,
    createdAt: 100,
    archivePath: "generated/selected/shots/episode-01/第01镜.png",
    included: true,
    importFile: "generated-0",
  })

  const form = new FormData()
  form.set("manifest", JSON.stringify(manifest))
  form.set("generated-0", new File([PNG], "第01镜.png", { type: "image/png" }))
  const response = await importProjectPackage(new Request("http://localhost/api/project-import", {
    method: "POST",
    headers: new Headers({ cookie: `chengju_sid=${OWNER}` }),
    body: form,
  }))
  const payload = await response.json()

  assert.equal(response.status, 200, payload.error)
  const projectId = payload.data.project.id as string
  const assets = listGeneratedAssets(db, projectId, "shot", "shot-entity-1")
  assert.equal(assets.length, 1)
  assert.ok(assets[0].selectedAt)
  assert.equal(listGenerationTasks(db, projectId).length, 1)
})

test("IMPORT-V2.5 页面接入 ZIP 解析、项目导入、本地 prefers 与参考图恢复", () => {
  const page = fs.readFileSync("app/page.tsx", "utf8")
  const bar = fs.readFileSync("components/ProjectBar.tsx", "utf8")
  const client = fs.readFileSync("lib/assets/api.ts", "utf8")

  assert.ok(page.includes("readStoreZip(file)"))
  assert.ok(page.includes("parseProjectPackage(raw)"))
  assert.ok(page.includes("importProjectPackage(form)"))
  assert.ok(page.includes("chengju:brief:"))
  assert.ok(page.includes("chengju:look:"))
  assert.ok(page.includes("chengju:judgments:"))
  assert.ok(page.includes("addFilesToVault"))
  assert.ok(bar.includes("onImportPackage"))
  assert.ok(client.includes("/api/project-import"))
})

test("IMPORT-V2.6 非法请求返回 400，缺失生成文件写入警告", async () => {
  __resetDbForTests(":memory:")
  const badForm = new FormData()
  badForm.set("manifest", JSON.stringify({ schema: "wrong", schemaVersion: 2 }))
  const bad = await importProjectPackage(new Request("http://localhost/api/project-import", {
    method: "POST",
    headers: new Headers({ cookie: `chengju_sid=${OWNER}` }),
    body: badForm,
  }))
  assert.equal(bad.status, 400)

  const manifest = packageManifest()
  manifest.keyframes.push({
    archivePath: "generated/selected/characters/林远/定妆图.png",
    included: true,
    importFile: "missing-file",
  } as never)
  const form = new FormData()
  form.set("manifest", JSON.stringify(manifest))
  const response = await importProjectPackage(new Request("http://localhost/api/project-import", {
    method: "POST",
    headers: new Headers({ cookie: `chengju_sid=${OWNER}` }),
    body: form,
  }))
  const payload = await response.json()
  assert.equal(response.status, 200, payload.error)
  assert.ok(payload.data.warnings.some((warning: string) => warning.includes("未随项目包提供")))
})

test("IMPORT-V2.7 完整备份重建快照血缘并恢复失败任务状态", async () => {
  __resetDbForTests(":memory:")
  const db = getDbForRequest()
  const manifest = packageManifest()
  manifest.snapshots.push(
    {
      id: "old-idea",
      kind: "idea",
      version: 1,
      payload: { idea: "旧想法", genre: "悬疑" },
      parents: [],
      createdAt: 1,
    } as never,
    {
      id: "old-characters",
      kind: "characters",
      version: 1,
      payload: [{ id: "c1", name: "林远" }],
      parents: ["old-idea"],
      createdAt: 2,
    } as never,
  )
  manifest.tasks.push({
    id: "failed-task",
    targetType: "character",
    targetId: "c1",
    providerId: "aliyun",
    model: "wanx",
    prompt: "portrait",
    status: "failed",
    error: "provider failed",
  } as never)

  const form = new FormData()
  form.set("manifest", JSON.stringify(manifest))
  const response = await importProjectPackage(new Request("http://localhost/api/project-import", {
    method: "POST",
    headers: new Headers({ cookie: `chengju_sid=${OWNER}` }),
    body: form,
  }))
  const payload = await response.json()
  assert.equal(response.status, 200, payload.error)
  const projectId = payload.data.project.id as string
  const characters = listSnapshots(db, projectId, "characters")
  assert.equal(characters.length, 1)
  assert.equal(characters[0].parents.length, 1)
  const restoredTasks = listGenerationTasks(db, projectId)
  assert.equal(restoredTasks.length, 1)
  assert.equal(restoredTasks[0].status, "failed")
})

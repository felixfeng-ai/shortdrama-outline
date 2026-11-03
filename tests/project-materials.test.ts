import { test } from "node:test"
import assert from "node:assert/strict"

import {
  DELETE as deleteMaterial,
  GET as getMaterials,
  POST as postMaterial,
} from "../app/api/projects/[id]/materials/route.ts"
import { createProject } from "../lib/assets/repo.ts"
import {
  deleteProjectMaterial,
  inferMaterialKind,
  listProjectMaterials,
  saveProjectMaterial,
} from "../lib/assets/materials.ts"
import { __resetDbForTests, getDbForRequest } from "../lib/assets/store.ts"

const OWNER_A = `anon_${"m".repeat(48)}`
const OWNER_B = `anon_${"n".repeat(48)}`

function request(pathname: string, init: RequestInit = {}, owner = OWNER_A): Request {
  const headers = new Headers(init.headers)
  headers.set("cookie", `chengju_sid=${owner}`)
  if (init.body) headers.set("content-type", "application/json")
  return new Request(`http://localhost${pathname}`, { ...init, headers })
}

function params(id: string) {
  return { params: { id } }
}

test("MAT1 原文类型可识别，长文统一截断到安全上限", () => {
  assert.equal(inferMaterialKind("雨夜剧本.txt", "第一场 内景 旧楼门口"), "script")
  assert.equal(inferMaterialKind("原著小说.txt", "第一章 雨夜"), "novel")
  assert.equal(inferMaterialKind("人物设定.md", "苏婉，68 岁"), "notes")

  __resetDbForTests(":memory:")
  const db = getDbForRequest()
  const project = createProject(db, "长文项目", OWNER_A)
  const material = saveProjectMaterial(db, {
    projectId: project.id,
    ownerId: OWNER_A,
    name: "超长小说.txt",
    mime: "text/plain",
    content: "雨".repeat(300_000),
  })
  assert.equal(material.characterCount, 200_000)
  assert.equal(material.content.length, 200_000)
  assert.equal(material.truncated, true)
})

test("MAT2 项目原文可保存、读取、去重和删除", () => {
  __resetDbForTests(":memory:")
  const db = getDbForRequest()
  const project = createProject(db, "原文项目", OWNER_A)
  const first = saveProjectMaterial(db, {
    projectId: project.id,
    ownerId: OWNER_A,
    name: "第一版.txt",
    mime: "text/plain",
    content: "第一场 内景 旧楼门口\n苏婉没有开门。",
  })
  const duplicate = saveProjectMaterial(db, {
    projectId: project.id,
    ownerId: OWNER_A,
    name: "重复文件.txt",
    mime: "text/plain",
    content: "第一场 内景 旧楼门口\n苏婉没有开门。",
  })

  assert.equal(duplicate.id, first.id)
  assert.equal(duplicate.deduped, true)
  assert.equal(listProjectMaterials(db, project.id).length, 1)
  assert.equal(listProjectMaterials(db, project.id)[0].characterCount, 19)

  assert.equal(deleteProjectMaterial(db, project.id, first.id), true)
  assert.equal(deleteProjectMaterial(db, project.id, first.id), false)
  assert.deepEqual(listProjectMaterials(db, project.id), [])
})

test("MAT3 原文 API 按项目归属隔离，并返回真实内容", async () => {
  __resetDbForTests(":memory:")
  const db = getDbForRequest()
  const project = createProject(db, "API 原文项目", OWNER_A)

  const created = await postMaterial(request(`/api/projects/${project.id}/materials`, {
    method: "POST",
    body: JSON.stringify({
      name: "短剧大纲.md",
      mime: "text/markdown",
      content: "# 第一集\n陈默在暴雨夜签收遗嘱。",
    }),
  }), params(project.id))
  assert.equal(created.status, 201)
  const createdBody = await created.json()
  assert.match(createdBody.data.material.content, /陈默/)

  const own = await getMaterials(
    request(`/api/projects/${project.id}/materials`),
    params(project.id),
  )
  assert.equal(own.status, 200)
  const ownBody = await own.json()
  assert.equal(ownBody.data.materials.length, 1)
  assert.equal(ownBody.data.materials[0].content, "")
  assert.ok(ownBody.data.materials[0].chunkCount >= 1)
  const withContent = await getMaterials(
    request(`/api/projects/${project.id}/materials?includeContent=1`),
    params(project.id),
  )
  assert.match((await withContent.json()).data.materials[0].content, /陈默/)

  const catalog = await getMaterials(
    request(`/api/projects/${project.id}/materials?materialId=${createdBody.data.material.id}`),
    params(project.id),
  )
  const catalogBody = await catalog.json()
  assert.ok(catalogBody.data.chunks.length >= 1)
  const chunk = await getMaterials(
    request(`/api/projects/${project.id}/materials?materialId=${createdBody.data.material.id}&chunk=0`),
    params(project.id),
  )
  assert.match((await chunk.json()).data.chunk.content, /陈默/)

  const foreign = await getMaterials(
    request(`/api/projects/${project.id}/materials`, {}, OWNER_B),
    params(project.id),
  )
  assert.equal(foreign.status, 403)

  const removed = await deleteMaterial(
    request(`/api/projects/${project.id}/materials?id=${createdBody.data.material.id}`, {
      method: "DELETE",
    }),
    params(project.id),
  )
  assert.equal(removed.status, 200)
})

test("MAT4 删除项目会级联清理项目原文", () => {
  __resetDbForTests(":memory:")
  const db = getDbForRequest()
  const project = createProject(db, "待删除原文", OWNER_A)
  saveProjectMaterial(db, {
    projectId: project.id,
    ownerId: OWNER_A,
    name: "原文.txt",
    mime: "text/plain",
    content: "一段项目原文",
  })
  db.prepare("DELETE FROM projects WHERE id = ?").run(project.id)
  const count = db.prepare(
    "SELECT COUNT(*) AS n FROM project_materials WHERE project_id = ?",
  ).get(project.id) as { n: number }
  assert.equal(count.n, 0)
})

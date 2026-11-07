import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

import { POST as bulkDelete } from "../app/api/projects/bulk/route.ts"
import { createProject, listProjects } from "../lib/assets/repo.ts"
import { __resetDbForTests, getDbForRequest } from "../lib/assets/store.ts"
import { SAMPLE_TITLE } from "../lib/sample.ts"

function request(body: unknown): Request {
  return new Request("http://localhost/api/projects/bulk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

test("PB1 清理重复示例时保留一份示例，不碰普通项目和他人项目", async () => {
  __resetDbForTests(":memory:")
  const db = getDbForRequest()
  createProject(db, SAMPLE_TITLE, "local")
  createProject(db, SAMPLE_TITLE, "local")
  createProject(db, SAMPLE_TITLE, "local")
  createProject(db, "我的正式项目", "local")
  createProject(db, SAMPLE_TITLE, "other-owner")

  const response = await bulkDelete(request({ scope: "duplicate-samples" }))
  const payload = await response.json()

  assert.equal(response.status, 200)
  assert.equal(payload.data.deletedCount, 2)
  assert.equal(payload.data.deletedIds.length, 2)
  const ownProjects = listProjects(db, "local")
  assert.equal(ownProjects.filter((project) => project.title === SAMPLE_TITLE).length, 1)
  assert.ok(ownProjects.some((project) => project.title === "我的正式项目"))
  assert.equal(listProjects(db, "other-owner").length, 1)
})

test("PB2 删除全部项目只清理当前 owner", async () => {
  __resetDbForTests(":memory:")
  const db = getDbForRequest()
  createProject(db, "项目 A", "local")
  createProject(db, "项目 B", "local")
  createProject(db, "别人的项目", "other-owner")

  const response = await bulkDelete(request({ scope: "all" }))
  const payload = await response.json()

  assert.equal(response.status, 200)
  assert.equal(payload.data.deletedCount, 2)
  assert.equal(listProjects(db, "local").length, 0)
  assert.equal(listProjects(db, "other-owner").length, 1)
})

test("PB3 项目菜单提供固定可见的批量清理入口和二次确认", () => {
  const sidebar = fs.readFileSync("components/WorkspaceSidebar.tsx", "utf8")
  const api = fs.readFileSync("lib/assets/api.ts", "utf8")
  const page = fs.readFileSync("app/page.tsx", "utf8")
  const css = fs.readFileSync("app/workspace-shell.css", "utf8")

  assert.match(sidebar, /清理重复示例/)
  assert.match(sidebar, /删除全部项目/)
  assert.match(sidebar, /wfx-project-list-scroll/)
  assert.match(sidebar, /bulkConfirm/)
  assert.match(api, /bulkDeleteProjects/)
  assert.match(page, /handleBulkDeleteProjects/)
  assert.match(css, /\.wfx-project-list-scroll/)
})

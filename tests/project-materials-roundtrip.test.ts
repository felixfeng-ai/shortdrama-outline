import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

import { GET as exportProject } from "../app/api/export/route.ts"
import { POST as importProject } from "../app/api/project-import/route.ts"
import { createProject, createSnapshot } from "../lib/assets/repo.ts"
import { listProjectMaterials, saveProjectMaterial } from "../lib/assets/materials.ts"
import { getProjectContext, saveProjectContext } from "../lib/assets/project-context.ts"
import { __resetDbForTests, getDbForRequest } from "../lib/assets/store.ts"

const OWNER = `anon_${"t".repeat(48)}`

function request(path: string, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers)
  headers.set("cookie", `chengju_sid=${OWNER}`)
  return new Request(`http://localhost${path}`, { ...init, headers })
}

test("ROUND1 服务端导出清单包含项目原文和真实创作上下文", async () => {
  __resetDbForTests(":memory:")
  const db = getDbForRequest()
  const project = createProject(db, "原文备份项目", OWNER)
  saveProjectMaterial(db, {
    projectId: project.id,
    ownerId: OWNER,
    name: "旧信剧本.txt",
    content: "第一章 雨夜\n陈默站在旧楼门口。",
  })
  saveProjectContext(db, project.id, OWNER, {
    brief: {
      premise: "快递员送出一封迟到四十年的信，却因此暴露自己的身世",
      payoff: "每封信都让旧案多一层真相",
      destination: "从替人送信走到敢于面对自己的来处",
      emotion: "克制",
      audience: "25-35 女性",
      references: "步履不停",
      redline: "不要爽剧",
    },
    look: { palette: "冷蓝", light: "阴天", lens: "长焦", banned: "霓虹" },
    episodeCount: 12,
  })
  createSnapshot(db, {
    projectId: project.id,
    kind: "idea",
    payload: { idea: "一个快递员送出一封迟到四十年的信", genre: "suspense" },
  })

  const response = await exportProject(request(`/api/export?projectId=${project.id}`))
  const payload = await response.json()

  assert.equal(response.status, 200, payload?.error ?? "")
  assert.equal(payload.data.manifest.materials.length, 1)
  assert.match(payload.data.manifest.materials[0].content, /陈默/)
  assert.equal(payload.data.manifest.projectSettings.episodeCount, 12)
  assert.equal(payload.data.manifest.projectSettings.brief.emotion, "克制")
  assert.equal(
    payload.data.manifest.projectSettings.brief.premise,
    "快递员送出一封迟到四十年的信，却因此暴露自己的身世",
  )
  assert.equal(payload.data.manifest.projectSettings.look.palette, "冷蓝")
})

test("ROUND2 项目包导入恢复原文和项目上下文", async () => {
  __resetDbForTests(":memory:")
  const db = getDbForRequest()
  const project = createProject(db, "导入原文项目", OWNER)
  const material = saveProjectMaterial(db, {
    projectId: project.id,
    ownerId: OWNER,
    name: "旧信剧本.txt",
    content: "第一章 雨夜\n陈默站在旧楼门口。",
  })
  const context = saveProjectContext(db, project.id, OWNER, {
    brief: {
      premise: "快递员送出一封迟到四十年的信，却因此暴露自己的身世",
      payoff: "每封信都让旧案多一层真相",
      destination: "从替人送信走到敢于面对自己的来处",
      emotion: "克制",
      audience: "25-35 女性",
      references: "步履不停",
      redline: "不要爽剧",
    },
    look: { palette: "冷蓝", light: "阴天", lens: "长焦", banned: "霓虹" },
    episodeCount: 12,
  })
  createSnapshot(db, {
    projectId: project.id,
    kind: "idea",
    payload: { idea: "一个快递员送出一封迟到四十年的信", genre: "suspense" },
  })
  const exported = await exportProject(request(`/api/export?projectId=${project.id}`))
  const manifest = (await exported.json()).data.manifest

  const form = new FormData()
  form.set("manifest", JSON.stringify(manifest))
  const response = await importProject(request("/api/project-import", {
    method: "POST",
    body: form,
  }))
  const payload = await response.json()

  assert.equal(response.status, 200, payload?.error ?? "")
  const importedId = payload.data.project.id as string
  const materials = listProjectMaterials(db, importedId)
  assert.equal(materials.length, 1)
  assert.equal(materials[0].name, material.name)
  assert.match(materials[0].content, /陈默/)
  const importedContext = getProjectContext(db, importedId)
  assert.equal(importedContext?.episodeCount, context.episodeCount)
  assert.equal(importedContext?.brief.emotion, "克制")
  assert.equal(
    importedContext?.brief.payoff,
    "每封信都让旧案多一层真相",
  )
  assert.equal(
    importedContext?.brief.destination,
    "从替人送信走到敢于面对自己的来处",
  )
  assert.equal(importedContext?.look.palette, "冷蓝")
  assert.equal(payload.data.counts.sources, 1)
})

test("ROUND3 Nginx 为项目导入提供独立的大请求体上限", () => {
  const nginx = fs.readFileSync("deploy/nginx-veyatv.com.conf", "utf8")
  assert.match(nginx, /location = \/api\/project-import[\s\S]*client_max_body_size 260m/)
  assert.match(nginx, /client_max_body_size 4m/)
})

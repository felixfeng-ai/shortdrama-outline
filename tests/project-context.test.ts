import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { GET as getContext, PUT as putContext } from "../app/api/projects/[id]/context/route.ts"
import { openDb } from "../lib/assets/db.ts"
import { createProject } from "../lib/assets/repo.ts"
import { __resetDbForTests, getDbForRequest } from "../lib/assets/store.ts"

const owner = `anon_${"p".repeat(48)}`
const otherOwner = `anon_${"q".repeat(48)}`

function request(pathname: string, init: RequestInit = {}, cookieOwner = owner): Request {
  const headers = new Headers(init.headers)
  headers.set("cookie", `chengju_sid=${cookieOwner}`)
  if (init.body) headers.set("content-type", "application/json")
  return new Request(`http://localhost${pathname}`, { ...init, headers })
}

function params(id: string) {
  return { params: { id } }
}

test("PC1 数据库迁移创建 schema_migrations 与 project_context，并保持幂等", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "chengju-project-context-"))
  const dbPath = path.join(dir, "context.db")
  try {
    const first = openDb(dbPath)
    try {
      const migrations = first.prepare(
        "SELECT version, name FROM schema_migrations ORDER BY version",
      ).all() as { version: number; name: string }[]
      assert.ok(migrations.some((item) =>
        item.version === 1 && item.name === "project-context"
      ))
      const contextColumns = first.prepare("PRAGMA table_info(project_context)").all() as {
        name: string
      }[]
      assert.deepEqual(
        contextColumns.map((item) => item.name),
        [
          "project_id",
          "brief_json",
          "look_json",
          "episode_count",
          "version",
          "updated_by",
          "updated_at",
        ],
      )
    } finally {
      first.close()
    }

    const second = openDb(dbPath)
    try {
      const count = second.prepare(
        "SELECT COUNT(*) AS n FROM schema_migrations WHERE version = 1",
      ).get() as { n: number }
      assert.equal(count.n, 1)
    } finally {
      second.close()
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test("PC2 项目上下文首次写入、读取与版本递增", async () => {
  __resetDbForTests(":memory:")
  const db = getDbForRequest()
  const project = createProject(db, "上下文项目", owner)

  const empty = await getContext(
    request(`/api/projects/${project.id}/context`),
    params(project.id),
  )
  assert.equal(empty.status, 200)
  assert.equal((await empty.json()).data.context, null)

  const created = await putContext(
    request(`/api/projects/${project.id}/context`, {
      method: "PUT",
      body: JSON.stringify({
        brief: {
          emotion: "克制",
          audience: "25-35 女性",
          references: "小偷家族、步履不停、小偷家族",
          redline: "不要爽剧",
        },
        look: {
          palette: "冷蓝、低饱和",
          light: "单一暖光",
          lens: "长焦",
          banned: "霓虹",
        },
        episodeCount: 3,
      }),
    }),
    params(project.id),
  )
  assert.equal(created.status, 200)
  const first = (await created.json()).data.context
  assert.equal(first.version, 1)
  assert.equal(first.episodeCount, 6)
  assert.equal(first.brief.references, "小偷家族、步履不停")

  const updated = await putContext(
    request(`/api/projects/${project.id}/context`, {
      method: "PUT",
      body: JSON.stringify({
        version: first.version,
        brief: first.brief,
        look: first.look,
        episodeCount: 60,
      }),
    }),
    params(project.id),
  )
  assert.equal(updated.status, 200)
  const second = (await updated.json()).data.context
  assert.equal(second.version, 2)
  assert.equal(second.episodeCount, 60)

  const read = await getContext(
    request(`/api/projects/${project.id}/context`),
    params(project.id),
  )
  const readContext = (await read.json()).data.context
  assert.equal(readContext.version, 2)
  assert.equal(readContext.brief.emotion, "克制")
})

test("PC3 过期版本返回 409，不覆盖其他设备的更新", async () => {
  __resetDbForTests(":memory:")
  const project = createProject(getDbForRequest(), "冲突项目", owner)
  const payload = {
    brief: { emotion: "紧张", audience: "", references: "", redline: "" },
    look: { palette: "", light: "", lens: "", banned: "" },
    episodeCount: 30,
  }
  const first = await putContext(
    request(`/api/projects/${project.id}/context`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
    params(project.id),
  )
  assert.equal(first.status, 200)

  const conflict = await putContext(
    request(`/api/projects/${project.id}/context`, {
      method: "PUT",
      body: JSON.stringify({ ...payload, version: 0 }),
    }),
    params(project.id),
  )
  assert.equal(conflict.status, 409)
  assert.match((await conflict.json()).error, /其他设备|刷新/)
})

test("PC5 创作契约 V2 七字段可持久化并在刷新后完整恢复", async () => {
  __resetDbForTests(":memory:")
  const project = createProject(getDbForRequest(), "契约项目", owner)
  const brief = {
    premise: "快递员想拿回手术费，却被逼送一封不能拆的信",
    payoff: "每次接近真相都付出更大的代价",
    destination: "从只想活命走到愿意为真相承担代价",
    emotion: "克制",
    audience: "25-35 女性",
    references: "漫长的季节、白日焰火",
    redline: "不要爽剧式打脸",
  }

  const saved = await putContext(
    request(`/api/projects/${project.id}/context`, {
      method: "PUT",
      body: JSON.stringify({ brief, episodeCount: 30 }),
    }),
    params(project.id),
  )
  assert.equal(saved.status, 200)

  const read = await getContext(
    request(`/api/projects/${project.id}/context`),
    params(project.id),
  )
  const restored = (await read.json()).data.context.brief
  assert.deepEqual(restored, brief)
})

test("PC4 项目归属隔离，项目删除后上下文级联清理", async () => {
  __resetDbForTests(":memory:")
  const db = getDbForRequest()
  const project = createProject(db, "私有项目", owner)
  const created = await putContext(
    request(`/api/projects/${project.id}/context`, {
      method: "PUT",
      body: JSON.stringify({
        brief: { emotion: "冷", audience: "", references: "", redline: "" },
        look: { palette: "", light: "", lens: "", banned: "" },
        episodeCount: 30,
      }),
    }),
    params(project.id),
  )
  assert.equal(created.status, 200)

  const forbidden = await getContext(
    request(`/api/projects/${project.id}/context`, {}, otherOwner),
    params(project.id),
  )
  assert.equal(forbidden.status, 403)

  db.prepare("DELETE FROM projects WHERE id = ? AND owner_id = ?").run(project.id, owner)
  const remaining = db.prepare(
    "SELECT COUNT(*) AS n FROM project_context WHERE project_id = ?",
  ).get(project.id) as { n: number }
  assert.equal(remaining.n, 0)
})

test("PC5 页面接入服务端上下文并保留本地迁移与降级缓存", () => {
  const page = fs.readFileSync("app/page.tsx", "utf8")
  const api = fs.readFileSync("lib/assets/api.ts", "utf8")
  assert.ok(page.includes("fetchProjectContext"))
  assert.ok(page.includes("saveProjectContext"))
  assert.ok(page.includes("chengju:brief:"))
  assert.ok(page.includes("chengju:look:"))
  assert.ok(page.includes("chengju:episodes:"))
  assert.ok(api.includes("/api/projects/"))
  assert.ok(api.includes("/context"))
})

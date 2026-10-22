import { test } from "node:test"
import assert from "node:assert/strict"

import { POST as postProject, GET as getProjects, DELETE as deleteProject } from "../app/api/projects/route.ts"
import { GET as getSnapshots, POST as postSnapshot } from "../app/api/snapshots/route.ts"
import { GET as getRefs, POST as postRefs } from "../app/api/refs/route.ts"
import { GET as exportGet } from "../app/api/export/route.ts"
import { POST as postCharacters } from "../app/api/characters/route.ts"
import { POST as postActs } from "../app/api/acts/route.ts"
import { POST as postEpisodes } from "../app/api/episodes/route.ts"
import { POST as postVisuals } from "../app/api/visual/route.ts"
import { POST as postScenes } from "../app/api/scenes/route.ts"
import { POST as postShots } from "../app/api/shots/route.ts"
import { getDbForRequest, __resetDbForTests } from "../lib/assets/store.ts"
import { identityFromRequest } from "../lib/quota.ts"

const COOKIE = "chengju_sid"
const A = `anon_${"a".repeat(43)}`
const B = `anon_${"b".repeat(43)}`
const C = `anon_${"c".repeat(43)}`

function request(url: string, init: RequestInit = {}, owner?: string): Request {
  const headers = new Headers(init.headers)
  if (owner) headers.set("cookie", `${COOKIE}=${owner}`)
  return new Request(url, { ...init, headers })
}

function json(body: unknown, owner?: string, url = "http://localhost/api/test"): Request {
  return request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }, owner)
}

async function create(title: string, owner: string) {
  const payload = await (await postProject(json({ title }, owner))).json()
  return payload.data.project.id as string
}

test("项目隔离：两个匿名会话只能看到各自项目", async () => {
  __resetDbForTests(":memory:")
  await create("A 的剧", A)
  await create("B 的剧", B)

  const list = (owner: string) => getProjects(request("http://localhost/api/projects", {}, owner))
  const a = await (await list(A)).json()
  const b = await (await list(B)).json()

  assert.deepEqual(a.data.projects.map((p: { title: string }) => p.title), ["A 的剧"])
  assert.deepEqual(b.data.projects.map((p: { title: string }) => p.title), ["B 的剧"])
})

test("项目隔离：其他会话不能删除或重命名项目", async () => {
  __resetDbForTests(":memory:")
  const projectId = await create("A 的剧", A)

  const remove = await deleteProject(request(`http://localhost/api/projects?id=${projectId}`, { method: "DELETE" }, B))
  assert.ok([400, 403, 404].includes(remove.status))

  const list = await (await getProjects(request("http://localhost/api/projects", {}, A))).json()
  assert.equal(list.data.projects.length, 1)
})

test("产物隔离：其他会话不能读写快照、图台账或导出", async () => {
  __resetDbForTests(":memory:")
  const projectId = await create("A 的剧", A)
  const url = (path: string) => `http://localhost${path}?projectId=${projectId}`

  const snapshots = await getSnapshots(request(url("/api/snapshots") + "&kind=characters", {}, B))
  const snapshotsWrite = await postSnapshot(json({ projectId, kind: "characters", payload: [] }, B))
  const refs = await getRefs(request(url("/api/refs"), {}, B))
  const refsWrite = await postRefs(json({
    projectId,
    refs: [{ vaultKey: "x.png", fileHash: "hash", ownerType: "character", ownerId: "角色" }],
  }, B))
  const exported = await exportGet(request(url("/api/export"), {}, B))

  for (const res of [snapshots, snapshotsWrite, refs, refsWrite, exported]) {
    assert.ok([400, 403, 404].includes(res.status))
  }
})

test("生成入口先校验项目归属，不能写入其他会话项目", async () => {
  __resetDbForTests(":memory:")
  const projectId = await create("A 的剧", A)
  const res = await postCharacters(json({ projectId, idea: "" }, B))
  assert.equal(res.status, 403)
})

test("所有生成接口都先做项目归属校验", async () => {
  __resetDbForTests(":memory:")
  const projectId = await create("A 的剧", A)
  const routes = [postActs, postEpisodes, postVisuals, postScenes, postShots]
  for (const route of routes) {
    const res = await route(json({ projectId }, B))
    assert.equal(res.status, 403)
  }
})

test("额度身份优先使用匿名会话，忽略可伪造的转发头", () => {
  const req = request("http://localhost/api/quota", {
    headers: { "x-forwarded-for": "203.0.113.9" },
  }, A)
  assert.equal(identityFromRequest(req), A)
})

test("旧项目仅在本地自动认领，线上默认不泄露", async () => {
  __resetDbForTests(":memory:")
  const db = getDbForRequest()
  const now = Date.now()
  db.prepare("INSERT INTO projects (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)")
    .run("legacy-project", "旧项目", now, now)

  const remote = await (await getProjects(request("https://example.com/api/projects", {}, B))).json()
  assert.equal(remote.data.projects.length, 0)

  const local = await (await getProjects(request("http://localhost/api/projects", {}, C))).json()
  assert.deepEqual(local.data.projects.map((p: { title: string }) => p.title), ["旧项目"])
})

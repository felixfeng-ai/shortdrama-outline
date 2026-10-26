import { test } from "node:test"
import assert from "node:assert/strict"

import { GET as readShare } from "../app/api/share/[token]/route.ts"
import { POST as createShare } from "../app/api/project-shares/route.ts"
import { __resetDbForTests, getDbForRequest } from "../lib/assets/store.ts"
import { createProject, createSnapshot } from "../lib/assets/repo.ts"

const owner = `anon_${"p".repeat(48)}`

function request(path: string, body?: unknown): Request {
  const headers = new Headers({ cookie: `chengju_sid=${owner}` })
  if (body) headers.set("content-type", "application/json")
  return new Request(`http://localhost${path}`, {
    method: body ? "POST" : "GET",
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
}

test("审阅链接 API 可公开读取，重新生成会撤销旧链接", async () => {
  __resetDbForTests(":memory:")
  const project = createProject(getDbForRequest(), "公开审阅项目", owner)
  createSnapshot(getDbForRequest(), {
    projectId: project.id,
    kind: "episodes",
    payload: [{ number: 1, title: "夜班", synopsis: "林远进入仓库。", hook: "门从外面锁上了。" }],
  })

  const firstResponse = await createShare(request("/api/project-shares", { projectId: project.id }))
  const first = (await firstResponse.json()).data.share
  assert.equal(firstResponse.status, 200)
  assert.match(first.token, /^[A-Za-z0-9_-]{40,}$/)

  const publicResponse = await readShare(request(`/api/share/${first.token}`), {
    params: { token: first.token },
  })
  const publicPayload = await publicResponse.json()
  assert.equal(publicResponse.status, 200)
  assert.equal(publicPayload.data.review.title, "公开审阅项目")
  assert.equal(publicPayload.data.review.episodes.length, 1)

  const second = (await (await createShare(
    request("/api/project-shares", { projectId: project.id }),
  )).json()).data.share
  assert.equal((await readShare(request(`/api/share/${first.token}`), {
    params: { token: first.token },
  })).status, 404)
  assert.equal((await readShare(request(`/api/share/${second.token}`), {
    params: { token: second.token },
  })).status, 200)
})

test("非法项目或无效 token 返回明确错误", async () => {
  __resetDbForTests(":memory:")
  const denied = await createShare(request("/api/project-shares", { projectId: "missing" }))
  assert.equal(denied.status, 404)
  const missing = await readShare(request("/api/share/not-a-valid-token"), {
    params: { token: "not-a-valid-token" },
  })
  assert.equal(missing.status, 404)
  assert.match((await missing.json()).error, /失效/)
})

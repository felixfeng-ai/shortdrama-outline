import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import test from "node:test"

import { DELETE as deleteOverride, POST as postOverride } from "../app/api/admin/quota-overrides/route.ts"
import { GET as getSummary } from "../app/api/admin/summary/route.ts"
import { GET as getUsers } from "../app/api/admin/users/route.ts"
import { GET as getVitals } from "../app/api/admin/vitals/route.ts"
import { __resetDbForTests, getDbForRequest } from "../lib/assets/store.ts"
import { createProject } from "../lib/assets/repo.ts"
import { readWebVitalEvent, recordWebVitalEvent } from "../lib/web-vitals.ts"

function seedAdminAndUser() {
  __resetDbForTests(":memory:")
  const db = getDbForRequest()
  const now = Date.now()
  for (const [id, email, name] of [
    ["user_admin", "owner@example.com", "owner"],
    ["user_creator", "creator@example.com", "编剧小鱼"],
  ]) {
    db.prepare(
      "INSERT INTO users (id, phone, email, display_name, created_at, updated_at) VALUES (?, NULL, ?, ?, ?, ?)",
    ).run(id, email, name, now, now)
  }
  createProject(db, "运营项目", "user_creator")
  const tokens = new Map<string, string>()
  for (const userId of ["user_admin", "user_creator"]) {
    const token = `${userId}-token`
    tokens.set(userId, token)
    db.prepare(
      `INSERT INTO auth_sessions
        (id, user_id, client_type, device_name, user_agent, created_at, expires_at, last_seen_at, revoked_at)
       VALUES (?, ?, 'web', 'test', 'test', ?, ?, ?, NULL)`,
    ).run(
      createHash("sha256").update(token).digest("hex"),
      userId,
      now,
      now + 86_400_000,
      now,
    )
  }
  return { db, tokens, now }
}

function request(
  path: string,
  token: string,
  init: RequestInit = {},
): Request {
  const headers = new Headers(init.headers)
  headers.set("cookie", `chengju_auth=${token}`)
  if (init.body) headers.set("content-type", "application/json")
  return new Request(`http://localhost${path}`, { ...init, headers })
}

test("普通用户不能读取管理员接口", async () => {
  const { tokens } = seedAdminAndUser()
  const response = await getUsers(request("/api/admin/users", tokens.get("user_creator")!))
  assert.equal(response.status, 403)
})

test("管理员可查询用户、设置额度并读取汇总", async () => {
  const { db, tokens, now } = seedAdminAndUser()
  process.env.ADMIN_EMAILS = "owner@example.com"
  try {
    const before = await getUsers(request("/api/admin/users?query=creator", tokens.get("user_admin")!))
    assert.equal(before.status, 200)
    const user = (await before.json()).data.users[0]
    assert.equal(user.username, "编剧小鱼")
    assert.equal(user.projectCount, 1)

    const set = await postOverride(request(
      "/api/admin/quota-overrides",
      tokens.get("user_admin")!,
      {
        method: "POST",
        body: JSON.stringify({
          targetUserId: "user_creator",
          extraUnits: 20,
          expiresAt: now + 86_400_000,
          reason: "运营补充额度",
        }),
      },
    ))
    assert.equal(set.status, 200)

    const summary = await getSummary(request("/api/admin/summary", tokens.get("user_admin")!))
    assert.equal(summary.status, 200)
    const data = (await summary.json()).data
    assert.equal(data.users, 2)
    assert.equal(data.projects, 1)
    assert.equal(data.activeQuotaOverrides, 1)
    assert.equal(data.recentOperations[0].action, "quota_override_set")
    assert.equal(data.recentOperations[0].targetUserId, "user_creator")
  } finally {
    delete process.env.ADMIN_EMAILS
  }
})

test("管理员可撤销额度覆盖并读取 Web Vitals 分位数", async () => {
  const { db, tokens, now } = seedAdminAndUser()
  process.env.ADMIN_EMAILS = "owner@example.com"
  try {
    await postOverride(request(
      "/api/admin/quota-overrides",
      tokens.get("user_admin")!,
      {
        method: "POST",
        body: JSON.stringify({
          targetUserId: "user_creator",
          extraUnits: 20,
          expiresAt: now + 86_400_000,
          reason: "运营补充额度",
        }),
      },
    ))
    const revoked = await deleteOverride(request(
      "/api/admin/quota-overrides",
      tokens.get("user_admin")!,
      {
        method: "DELETE",
        body: JSON.stringify({
          targetUserId: "user_creator",
          reason: "测试完成",
        }),
      },
    ))
    assert.equal(revoked.status, 200)

    recordWebVitalEvent(db, "user_creator", readWebVitalEvent({
      name: "LCP",
      value: 1800,
      path: "/",
      device: "mobile",
      rating: "good",
      connection: "4g",
      release: "r1",
    }), now)
    const vitals = await getVitals(request("/api/admin/vitals?days=7", tokens.get("user_admin")!))
    assert.equal(vitals.status, 200)
    const rows = (await vitals.json()).data.rows
    assert.equal(rows[0].samples, 1)
    assert.equal(rows[0].p75, 1800)
  } finally {
    delete process.env.ADMIN_EMAILS
  }
})

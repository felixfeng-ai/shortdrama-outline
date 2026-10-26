import { test } from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"

import { POST as requestCode } from "../app/api/auth/request-code/route.ts"
import { POST as verifyCode } from "../app/api/auth/verify-code/route.ts"
import { GET as getSession } from "../app/api/auth/session/route.ts"
import { POST as logout } from "../app/api/auth/logout/route.ts"
import { POST as refreshAccess } from "../app/api/auth/refresh/route.ts"
import { DELETE as revokeDevice, GET as listSessions } from "../app/api/auth/sessions/route.ts"
import { __resetDbForTests, getDbForRequest } from "../lib/assets/store.ts"
import { createProject } from "../lib/assets/repo.ts"
import { resolveProjectOwner, AUTH_COOKIE } from "../lib/auth/request.ts"
import { userFromSessionToken } from "../lib/auth/service.ts"

const anonymousOwner = `anon_${"a".repeat(48)}`
process.env.AUTH_ALLOW_DEV_CODE = "1"

function request(path: string, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers)
  headers.set("cookie", `chengju_sid=${anonymousOwner}`)
  if (init.body) headers.set("content-type", "application/json")
  return new Request(`http://localhost${path}`, { ...init, headers })
}

test("开发验证码只在本机且显式开启时可用", async () => {
  __resetDbForTests(":memory:")
  const env = process.env as Record<string, string | undefined>
  const previousNodeEnv = env.NODE_ENV
  process.env.AUTH_SECRET = "auth-api-test-secret"
  try {
    env.NODE_ENV = "production"
    process.env.AUTH_ALLOW_DEV_CODE = "0"
    const disabled = await requestCode(request("/api/auth/request-code", {
      method: "POST",
      body: JSON.stringify({ phone: "13600136000" }),
    }))
    assert.equal(disabled.status, 503)
    assert.doesNotMatch(JSON.stringify(await disabled.json()), /devCode/)

    process.env.AUTH_ALLOW_DEV_CODE = "1"
    const local = await requestCode(request("/api/auth/request-code", {
      method: "POST",
      body: JSON.stringify({ phone: "13600136000" }),
    }))
    assert.equal(local.status, 200)
    assert.match((await local.json()).data.devCode, /^\d{6}$/)

    const remote = await requestCode(new Request("http://example.com/api/auth/request-code", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phone: "13500135000" }),
    }))
    assert.equal(remote.status, 503)
  } finally {
    process.env.AUTH_ALLOW_DEV_CODE = "1"
    if (previousNodeEnv === undefined) delete env.NODE_ENV
    else env.NODE_ENV = previousNodeEnv
    delete process.env.AUTH_SECRET
  }
})

test("开发环境请求验证码；Web 验证成功设置 HttpOnly Cookie 并认领匿名项目", async () => {
  __resetDbForTests(":memory:")
  process.env.AUTH_SECRET = "auth-api-test-secret"
  try {
    const project = createProject(getDbForRequest(), "登录前项目", anonymousOwner)
    const requested = await requestCode(request("/api/auth/request-code", {
      method: "POST",
      body: JSON.stringify({ phone: "13800138000" }),
    }))
    const requestedPayload = await requested.json()
    assert.equal(requested.status, 200)
    assert.match(requestedPayload.data.devCode, /^\d{6}$/)

    const verified = await verifyCode(request("/api/auth/verify-code", {
      method: "POST",
      body: JSON.stringify({
        phone: "13800138000",
        code: requestedPayload.data.devCode,
      }),
    }))
    const verifiedPayload = await verified.json()
    assert.equal(verified.status, 200)
    assert.match(verifiedPayload.data.user.id, /^user_/)
    const cookie = verified.headers.get("set-cookie") || ""
    assert.match(cookie, new RegExp(`${AUTH_COOKIE}=`))
    assert.match(cookie, /HttpOnly/i)
    assert.equal(resolveProjectOwner(getDbForRequest(), new Request("http://localhost", {
      headers: { cookie: cookie.split(";")[0] },
    })), verifiedPayload.data.user.id)
    const row = getDbForRequest().prepare("SELECT owner_id FROM projects WHERE id = ?").get(project.id) as { owner_id: string }
    assert.equal(row.owner_id, verifiedPayload.data.user.id)
  } finally {
    delete process.env.AUTH_SECRET
  }
})

test("App 客户端验证后拿到 Bearer Token，并可通过 session 接口恢复用户", async () => {
  __resetDbForTests(":memory:")
  process.env.AUTH_SECRET = "auth-api-test-secret"
  try {
    const requested = await requestCode(request("/api/auth/request-code", {
      method: "POST",
      body: JSON.stringify({ phone: "13900139000" }),
    }))
    const code = (await requested.json()).data.devCode
    const verified = await verifyCode(request("/api/auth/verify-code", {
      method: "POST",
      body: JSON.stringify({ phone: "13900139000", code, client: "app", deviceName: "iPhone 16" }),
    }))
    const payload = await verified.json()
    assert.match(payload.data.accessToken, /^cj1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
    assert.match(payload.data.refreshToken, /^[A-Za-z0-9_-]{40,}$/)
    assert.ok(payload.data.accessExpiresAt < payload.data.expiresAt)

    const session = await getSession(new Request("http://localhost/api/auth/session", {
      headers: { authorization: `Bearer ${payload.data.accessToken}` },
    }))
    const sessionPayload = await session.json()
    assert.equal(sessionPayload.data.user.id, payload.data.user.id)
    const refreshAsBearer = await getSession(new Request("http://localhost/api/auth/session", {
      headers: { authorization: `Bearer ${payload.data.refreshToken}` },
    }))
    assert.equal((await refreshAsBearer.json()).data.user, null)

    const refreshed = await refreshAccess(new Request("http://localhost/api/auth/refresh", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken: payload.data.refreshToken }),
    }))
    const refreshedPayload = await refreshed.json()
    assert.equal(refreshed.status, 200)
    assert.match(refreshedPayload.data.accessToken, /^cj1\./)
  } finally {
    delete process.env.AUTH_SECRET
  }
})

test("账号会话列表按用户隔离，并可退出其他设备", async () => {
  __resetDbForTests(":memory:")
  process.env.AUTH_SECRET = "auth-api-test-secret"
  try {
    const requested = await requestCode(request("/api/auth/request-code", {
      method: "POST",
      body: JSON.stringify({ phone: "13600136000" }),
    }))
    const code = (await requested.json()).data.devCode
    const verified = await verifyCode(request("/api/auth/verify-code", {
      method: "POST",
      body: JSON.stringify({
        phone: "13600136000",
        code,
        client: "app",
        deviceName: "iPhone 16",
      }),
    }))
    const payload = await verified.json()
    const userId = payload.data.user.id as string
    const otherRefresh = "second-device-refresh-token"
    const otherSessionId = createHash("sha256").update(otherRefresh).digest("hex")
    getDbForRequest().prepare(
      `INSERT INTO auth_sessions
        (id, user_id, client_type, device_name, user_agent, created_at, expires_at, last_seen_at, revoked_at)
       VALUES (?, ?, 'web', 'Mac Chrome', 'Chrome', ?, ?, ?, NULL)`,
    ).run(otherSessionId, userId, Date.now(), Date.now() + 86_400_000, Date.now())
    const authHeader = { authorization: `Bearer ${payload.data.accessToken}` }

    const listed = await listSessions(new Request("http://localhost/api/auth/sessions", {
      headers: authHeader,
    }))
    const sessions = (await listed.json()).data.sessions
    assert.equal(listed.status, 200)
    assert.equal(sessions.length, 2)
    assert.equal(sessions.find((item: { current: boolean }) => item.current).deviceName, "iPhone 16")

    const revoked = await revokeDevice(request("/api/auth/sessions", {
      method: "DELETE",
      headers: authHeader,
      body: JSON.stringify({ sessionId: otherSessionId }),
    }))
    assert.equal(revoked.status, 200)
    assert.equal(userFromSessionToken(getDbForRequest(), otherRefresh), null)
  } finally {
    delete process.env.AUTH_SECRET
  }
})

test("退出登录撤销会话并清除 Cookie", async () => {
  __resetDbForTests(":memory:")
  process.env.AUTH_SECRET = "auth-api-test-secret"
  try {
    const requested = await requestCode(request("/api/auth/request-code", {
      method: "POST",
      body: JSON.stringify({ phone: "13700137000" }),
    }))
    const code = (await requested.json()).data.devCode
    const verified = await verifyCode(request("/api/auth/verify-code", {
      method: "POST",
      body: JSON.stringify({ phone: "13700137000", code, client: "app" }),
    }))
    const payload = await verified.json()
    const authHeader = { authorization: `Bearer ${payload.data.accessToken}` }

    const response = await logout(new Request("http://localhost/api/auth/logout", {
      method: "POST",
      headers: authHeader,
    }))
    assert.equal(response.status, 200)
    assert.match(response.headers.get("set-cookie") || "", /Max-Age=0/i)
    const session = await getSession(new Request("http://localhost/api/auth/session", {
      headers: authHeader,
    }))
    assert.equal((await session.json()).data.user, null)
  } finally {
    delete process.env.AUTH_SECRET
  }
})

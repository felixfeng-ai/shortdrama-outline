import { test } from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"

import { POST as requestEmailCode } from "../app/api/auth/email/request-code/route.ts"
import { POST as verifyEmailCode } from "../app/api/auth/email/verify-code/route.ts"
import { openDb } from "../lib/assets/db.ts"
import { createProject } from "../lib/assets/repo.ts"
import { __resetDbForTests, getDbForRequest } from "../lib/assets/store.ts"
import { AUTH_COOKIE } from "../lib/auth/request.ts"
import {
  normalizeEmail,
  requestEmailLoginCode,
  verifyEmailLoginCode,
  userFromSessionToken,
} from "../lib/auth/service.ts"

const secret = "email-auth-test-secret"
const anonymousOwner = `anon_${"e".repeat(48)}`

function request(path: string, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers)
  headers.set("cookie", `chengju_sid=${anonymousOwner}`)
  if (init.body) headers.set("content-type", "application/json")
  return new Request(`http://localhost${path}`, { ...init, headers })
}

test("E1 邮箱规范化：去空格、转小写，并拒绝非法地址", () => {
  assert.equal(normalizeEmail("  Writer@Example.COM "), "writer@example.com")
  assert.throws(() => normalizeEmail("writer"), /邮箱/)
  assert.throws(() => normalizeEmail("writer @example.com"), /邮箱/)
  assert.throws(() => normalizeEmail(`${"a".repeat(250)}@b.co`), /邮箱/)
  assert.throws(() => normalizeEmail(""), /邮箱/)
})

test("E2 邮箱验证码只保存哈希，并有发送冷却", () => {
  const db = openDb(":memory:")
  const now = Date.now()
  try {
    const issued = requestEmailLoginCode(db, " Writer@Example.com ", {
      now,
      secret,
      dev: true,
    })
    assert.match(issued.devCode || "", /^\d{6}$/)
    assert.equal(issued.cooldownSeconds, 60)
    const row = db.prepare(
      "SELECT email, code_hash FROM email_login_codes ORDER BY created_at DESC",
    ).get() as { email: string; code_hash: string }
    assert.equal(row.email, "writer@example.com")
    assert.notEqual(row.code_hash, issued.devCode)
    assert.equal(row.code_hash.length, 64)
    assert.throws(
      () => requestEmailLoginCode(db, "writer@example.com", {
        now: now + 10_000,
        secret,
        dev: true,
      }),
      /稍后再试/,
    )
  } finally {
    db.close()
  }
})

test("E3 邮箱验证码创建用户和会话，错误、过期与重复使用被拒绝", () => {
  const db = openDb(":memory:")
  const now = Date.now()
  try {
    const issued = requestEmailLoginCode(db, "writer@example.com", {
      now,
      secret,
      dev: true,
    })
    assert.throws(
      () => verifyEmailLoginCode(db, "writer@example.com", "000000", {
        now: now + 1_000,
        secret,
      }),
      /验证码错误/,
    )
    const session = verifyEmailLoginCode(db, "writer@example.com", issued.devCode!, {
      now: now + 2_000,
      secret,
    })
    assert.match(session.user.id, /^user_/)
    assert.equal(session.user.email, "writer@example.com")
    assert.equal(session.user.phone, null)
    assert.equal(userFromSessionToken(db, session.token, now + 3_000)?.id, session.user.id)
    assert.throws(
      () => verifyEmailLoginCode(db, "writer@example.com", issued.devCode!, {
        now: now + 4_000,
        secret,
      }),
      /过期|重新获取/,
    )

    const old = requestEmailLoginCode(db, "late@example.com", {
      now,
      secret,
      dev: true,
    })
    assert.throws(
      () => verifyEmailLoginCode(db, "late@example.com", old.devCode!, {
        now: now + 6 * 60_000,
        secret,
      }),
      /过期/,
    )
  } finally {
    db.close()
  }
})

test("E4 开发环境邮箱登录设置 HttpOnly Cookie 并认领匿名项目", async () => {
  __resetDbForTests(":memory:")
  process.env.AUTH_SECRET = secret
  process.env.AUTH_ALLOW_DEV_CODE = "1"
  delete process.env.RESEND_API_KEY
  delete process.env.AUTH_EMAIL_FROM
  try {
    const project = createProject(getDbForRequest(), "邮箱登录前项目", anonymousOwner)
    const requested = await requestEmailCode(request("/api/auth/email/request-code", {
      method: "POST",
      body: JSON.stringify({ email: "Writer@Example.com" }),
    }))
    const requestedPayload = await requested.json()
    assert.equal(requested.status, 200)
    assert.match(requestedPayload.data.devCode, /^\d{6}$/)

    const verified = await verifyEmailCode(request("/api/auth/email/verify-code", {
      method: "POST",
      body: JSON.stringify({
        email: "writer@example.com",
        code: requestedPayload.data.devCode,
      }),
    }))
    const verifiedPayload = await verified.json()
    assert.equal(verified.status, 200)
    assert.equal(verifiedPayload.data.user.email, "writer@example.com")
    assert.equal(verifiedPayload.data.user.phone, null)
    const cookie = verified.headers.get("set-cookie") || ""
    assert.match(cookie, new RegExp(`${AUTH_COOKIE}=`))
    assert.match(cookie, /HttpOnly/i)
    const row = getDbForRequest().prepare(
      "SELECT owner_id FROM projects WHERE id = ?",
    ).get(project.id) as { owner_id: string }
    assert.equal(row.owner_id, verifiedPayload.data.user.id)
  } finally {
    delete process.env.AUTH_SECRET
    delete process.env.AUTH_ALLOW_DEV_CODE
  }
})

test("E5 生产环境未配置邮件服务时明确拒绝，不返回验证码", async () => {
  __resetDbForTests(":memory:")
  process.env.AUTH_SECRET = secret
  delete process.env.RESEND_API_KEY
  delete process.env.AUTH_EMAIL_FROM
  try {
    const response = await requestEmailCode(new Request(
      "https://chenju.work/api/auth/email/request-code",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "writer@example.com" }),
      },
    ))
    const payload = await response.json()
    assert.equal(response.status, 503)
    assert.match(payload.error, /邮箱登录通道尚未配置/)
    assert.doesNotMatch(JSON.stringify(payload), /devCode|code/)
  } finally {
    delete process.env.AUTH_SECRET
  }
})

test("E6 旧手机号数据库升级后保留用户和会话，并允许新增邮箱列", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "chengju-email-migration-"))
  const dbPath = path.join(dir, "legacy.db")
  const legacy = new DatabaseSync(dbPath)
  const now = Date.now()
  const refreshToken = "legacy-refresh-token"
  const sessionId = createHash("sha256").update(refreshToken).digest("hex")
  try {
    legacy.exec(`
      CREATE TABLE users (
        id            TEXT PRIMARY KEY,
        phone         TEXT NOT NULL UNIQUE,
        display_name  TEXT NOT NULL,
        created_at    INTEGER NOT NULL,
        updated_at    INTEGER NOT NULL
      );
      CREATE TABLE auth_sessions (
        id            TEXT PRIMARY KEY,
        user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        client_type   TEXT NOT NULL DEFAULT 'web',
        device_name   TEXT NOT NULL DEFAULT '',
        user_agent    TEXT NOT NULL DEFAULT '',
        created_at    INTEGER NOT NULL,
        expires_at    INTEGER NOT NULL,
        last_seen_at  INTEGER NOT NULL,
        revoked_at    INTEGER
      );
    `)
    legacy.prepare(
      "INSERT INTO users (id, phone, display_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    ).run("user_legacy", "+8613800138000", "旧用户", now, now)
    legacy.prepare(
      `INSERT INTO auth_sessions
        (id, user_id, client_type, device_name, user_agent, created_at, expires_at, last_seen_at, revoked_at)
       VALUES (?, ?, 'web', 'Legacy Chrome', 'Chrome', ?, ?, ?, NULL)`,
    ).run(sessionId, "user_legacy", now, now + 86_400_000, now)
  } finally {
    legacy.close()
  }

  const db = openDb(dbPath)
  try {
    const columns = db.prepare("PRAGMA table_info(users)").all() as {
      name: string
      notnull: number
    }[]
    assert.equal(columns.find((column) => column.name === "phone")?.notnull, 0)
    assert.ok(columns.some((column) => column.name === "email"))
    assert.equal(userFromSessionToken(db, refreshToken, now + 1_000)?.id, "user_legacy")
    assert.equal(
      (db.prepare("SELECT phone FROM users WHERE id = ?").get("user_legacy") as { phone: string }).phone,
      "+8613800138000",
    )
  } finally {
    db.close()
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test("E7 已配置邮件服务时只发送验证码，不在 API 响应中泄露", async () => {
  __resetDbForTests(":memory:")
  process.env.AUTH_SECRET = secret
  process.env.RESEND_API_KEY = "re_test_key"
  process.env.AUTH_EMAIL_FROM = "成剧 <login@chenju.work>"
  delete process.env.AUTH_ALLOW_DEV_CODE
  const originalFetch = globalThis.fetch
  let mailBody: Record<string, unknown> | null = null
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    mailBody = JSON.parse(String(init?.body)) as Record<string, unknown>
    return new Response(JSON.stringify({ id: "mail_test" }), { status: 200 })
  }) as typeof fetch
  try {
    const response = await requestEmailCode(new Request(
      "https://chenju.work/api/auth/email/request-code",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "writer@example.com" }),
      },
    ))
    const payload = await response.json()
    assert.equal(response.status, 200)
    assert.equal(payload.data.devCode, undefined)
    const sent = mailBody as Record<string, unknown> | null
    assert.ok(sent)
    assert.deepEqual(sent.to, ["writer@example.com"])
    assert.match(String(sent.subject), /验证码/)
    assert.match(String(sent.text), /\d{6}/)
  } finally {
    globalThis.fetch = originalFetch
    delete process.env.RESEND_API_KEY
    delete process.env.AUTH_EMAIL_FROM
    delete process.env.AUTH_SECRET
  }
})

test("E8 邮件发送失败时清理验证码并返回 502", async () => {
  __resetDbForTests(":memory:")
  process.env.AUTH_SECRET = secret
  process.env.RESEND_API_KEY = "re_test_key"
  process.env.AUTH_EMAIL_FROM = "成剧 <login@chenju.work>"
  delete process.env.AUTH_ALLOW_DEV_CODE
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () => new Response("rejected", { status: 500 })) as typeof fetch
  try {
    const response = await requestEmailCode(new Request(
      "https://chenju.work/api/auth/email/request-code",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "writer@example.com" }),
      },
    ))
    assert.equal(response.status, 502)
    const count = getDbForRequest().prepare(
      "SELECT COUNT(*) AS n FROM email_login_codes",
    ).get() as { n: number }
    assert.equal(count.n, 0)
  } finally {
    globalThis.fetch = originalFetch
    delete process.env.RESEND_API_KEY
    delete process.env.AUTH_EMAIL_FROM
    delete process.env.AUTH_SECRET
  }
})

test("E9 同一 IP 超限后路由返回 429，且不新增验证码记录", async () => {
  __resetDbForTests(":memory:")
  process.env.AUTH_SECRET = secret
  process.env.AUTH_ALLOW_DEV_CODE = "1"
  try {
    for (let i = 0; i < 5; i += 1) {
      const response = await requestEmailCode(request("/api/auth/email/request-code", {
        method: "POST",
        headers: { "x-real-ip": "203.0.113.50" },
        body: JSON.stringify({ email: `writer-${i}@example.com` }),
      }))
      assert.equal(response.status, 200)
    }

    const blocked = await requestEmailCode(request("/api/auth/email/request-code", {
      method: "POST",
      headers: { "x-real-ip": "203.0.113.50" },
      body: JSON.stringify({ email: "writer-5@example.com" }),
    }))
    assert.equal(blocked.status, 429)
    const count = getDbForRequest().prepare(
      "SELECT COUNT(*) AS n FROM email_login_codes",
    ).get() as { n: number }
    assert.equal(count.n, 5)
  } finally {
    delete process.env.AUTH_SECRET
    delete process.env.AUTH_ALLOW_DEV_CODE
  }
})

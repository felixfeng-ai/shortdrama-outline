import { test } from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"

import * as accountRoute from "../app/api/account/route.ts"
import { openDb } from "../lib/assets/db.ts"
import { __resetDbForTests, getDbForRequest } from "../lib/assets/store.ts"
import {
  requestEmailLoginCode,
  userFromSessionToken,
  verifyEmailLoginCode,
} from "../lib/auth/service.ts"

const secret = "auth-username-test-secret"

function emailSession(db: ReturnType<typeof openDb>, email: string) {
  const issued = requestEmailLoginCode(db, email, {
    now: Date.now(),
    secret,
    dev: true,
  })
  return verifyEmailLoginCode(db, email, issued.devCode!, {
    now: Date.now() + 1_000,
    secret,
  })
}

test("USR1 邮箱首次登录生成短用户名，不再拼接邮箱前缀", () => {
  const db = openDb(":memory:")
  try {
    const session = emailSession(db, "siyuanfeng-yx@example.com")
    assert.doesNotMatch(session.user.displayName, /用户|siyuanfeng|@/i)
    assert.ok(Array.from(session.user.displayName).length >= 2)
    assert.ok(Array.from(session.user.displayName).length <= 16)
    assert.equal(session.user.username, session.user.displayName)
  } finally {
    db.close()
  }
})

test("USR2 旧版邮箱显示名在恢复会话时自动改为用户名", () => {
  const db = openDb(":memory:")
  const now = Date.now()
  const refreshToken = "legacy-email-display-name"
  try {
    db.prepare(
      `INSERT INTO users (id, phone, email, display_name, created_at, updated_at)
       VALUES (?, NULL, ?, ?, ?, ?)`,
    ).run(
      "user_legacy_username",
      "writer-long-email@example.com",
      "用户writer-long",
      now,
      now,
    )
    db.prepare(
      `INSERT INTO auth_sessions
        (id, user_id, client_type, device_name, user_agent, created_at, expires_at, last_seen_at, revoked_at)
       VALUES (?, ?, 'web', 'Legacy Chrome', 'Chrome', ?, ?, ?, NULL)`,
    ).run(
      createHash("sha256").update(refreshToken).digest("hex"),
      "user_legacy_username",
      now,
      now + 86_400_000,
      now,
    )

    const user = userFromSessionToken(db, refreshToken, now + 1_000)
    assert.ok(user)
    assert.doesNotMatch(user.displayName, /用户|writer|@/i)
    assert.equal(user.username, user.displayName)
    const saved = db.prepare(
      "SELECT display_name FROM users WHERE id = ?",
    ).get("user_legacy_username") as { display_name: string }
    assert.equal(saved.display_name, user.displayName)
  } finally {
    db.close()
  }
})

test("USR3 账户接口可以保存用户名，并拒绝与其他账户冲突", async () => {
  __resetDbForTests(":memory:")
  const db = getDbForRequest()
  const first = emailSession(db, "first@example.com")
  const second = emailSession(db, "second@example.com")

  const patch = accountRoute.PATCH
  assert.equal(typeof patch, "function")

  const saved = await patch(new Request("http://localhost/api/account", {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      cookie: `chengju_auth=${first.token}`,
    },
    body: JSON.stringify({ username: "青禾编剧" }),
  }))
  const savedPayload = await saved.json()
  assert.equal(saved.status, 200)
  assert.equal(savedPayload.data.user.username, "青禾编剧")
  assert.equal(savedPayload.data.user.displayName, "青禾编剧")

  const conflict = await patch(new Request("http://localhost/api/account", {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      cookie: `chengju_auth=${second.token}`,
    },
    body: JSON.stringify({ username: "青禾编剧" }),
  }))
  const conflictPayload = await conflict.json()
  assert.equal(conflict.status, 409)
  assert.match(conflictPayload.error, /占用/)
})

test("USR4 用户名只允许 2–16 个中英文、数字、下划线或短横线", async () => {
  __resetDbForTests(":memory:")
  const db = getDbForRequest()
  const session = emailSession(db, "validation@example.com")
  const patch = accountRoute.PATCH

  for (const username of ["a", "含 空格", "mail@example.com", "名".repeat(17)]) {
    const response = await patch(new Request("http://localhost/api/account", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        cookie: `chengju_auth=${session.token}`,
      },
      body: JSON.stringify({ username }),
    }))
    assert.equal(response.status, 400)
  }
})

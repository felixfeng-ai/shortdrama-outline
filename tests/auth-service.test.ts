import { test } from "node:test"
import assert from "node:assert/strict"

import { openDb } from "../lib/assets/db.ts"
import { createProject } from "../lib/assets/repo.ts"
import {
  claimAnonymousProjects,
  normalizePhone,
  requestLoginCode,
  revokeSessionToken,
  userFromSessionToken,
  verifyLoginCode,
} from "../lib/auth/service.ts"

const owner = `anon_${"l".repeat(48)}`
const secret = "test-auth-secret"

test("手机号规范化：支持中国大陆手机号与 +86 前缀", () => {
  assert.equal(normalizePhone("13800138000"), "+8613800138000")
  assert.equal(normalizePhone("+86 138-0013-8000"), "+8613800138000")
  assert.throws(() => normalizePhone("123"), /手机号/)
  assert.throws(() => normalizePhone(""), /手机号/)
})

test("验证码只保存哈希，开发环境可以返回 devCode，并有发送冷却", () => {
  const db = openDb(":memory:")
  const now = Date.now()
  try {
    const issued = requestLoginCode(db, "+8613800138000", { now, secret, dev: true })
    assert.match(issued.devCode || "", /^\d{6}$/)
    const row = db.prepare("SELECT code_hash FROM login_codes ORDER BY created_at DESC").get() as { code_hash: string }
    assert.notEqual(row.code_hash, issued.devCode)
    assert.equal(row.code_hash.length, 64)
    assert.throws(
      () => requestLoginCode(db, "+8613800138000", { now: now + 10_000, secret, dev: true }),
      /稍后再试/,
    )
  } finally {
    db.close()
  }
})

test("正确验证码创建用户和会话，错误、过期验证码被拒绝", () => {
  const db = openDb(":memory:")
  const now = Date.now()
  try {
    const issued = requestLoginCode(db, "+8613800138000", { now, secret, dev: true })
    assert.throws(
      () => verifyLoginCode(db, "+8613800138000", "000000", { now: now + 1_000, secret }),
      /验证码错误/,
    )
    const session = verifyLoginCode(db, "+8613800138000", issued.devCode!, { now: now + 2_000, secret })
    assert.match(session.user.id, /^user_/)
    assert.equal(session.user.phone, "+8613800138000")
    assert.ok(session.token.length >= 40)
    assert.equal(userFromSessionToken(db, session.token, now + 3_000)?.id, session.user.id)
    assert.equal(revokeSessionToken(db, session.token, now + 4_000), true)
    assert.equal(userFromSessionToken(db, session.token, now + 5_000), null)

    const old = requestLoginCode(db, "+8613900139000", { now, secret, dev: true })
    assert.throws(
      () => verifyLoginCode(db, "+8613900139000", old.devCode!, { now: now + 6 * 60_000, secret }),
      /过期/,
    )
  } finally {
    db.close()
  }
})

test("首次登录只认领当前匿名会话项目，不碰其他匿名项目", () => {
  const db = openDb(":memory:")
  const now = Date.now()
  try {
    const own = createProject(db, "匿名项目", owner)
    createProject(db, "别人的项目", `anon_${"x".repeat(48)}`)
    db.prepare(
      `INSERT INTO push_subscriptions
        (id, owner_id, endpoint, p256dh, auth, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      "push-1",
      owner,
      "https://fcm.googleapis.com/fcm/send/auth-test",
      "key",
      "auth",
      now,
      now,
    )
    const user = { id: "user-test" }
    db.prepare(
      "INSERT INTO users (id, phone, display_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    ).run(user.id, "+8613700137000", "用户3700", now, now)

    assert.deepEqual(claimAnonymousProjects(db, owner, user.id), {
      projects: 1,
      pushSubscriptions: 1,
    })
    const claimed = db.prepare("SELECT owner_id FROM projects WHERE id = ?").get(own.id) as { owner_id: string }
    assert.equal(claimed.owner_id, user.id)
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS n FROM projects WHERE owner_id LIKE 'anon_%'").get() as { n: number }).n,
      1,
    )
  } finally {
    db.close()
  }
})

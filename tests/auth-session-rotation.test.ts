import { test } from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"

import { openDb } from "../lib/assets/db.ts"
import {
  createAccessToken,
  listUserSessions,
  refreshAccessToken,
  requestLoginCode,
  revokeSessionForToken,
  revokeUserSession,
  userFromAccessToken,
  userFromSessionToken,
  verifyLoginCode,
} from "../lib/auth/service.ts"

const secret = "auth-session-rotation-secret"

function login(db: ReturnType<typeof openDb>, phone: string, now: number, deviceName: string) {
  const issued = requestLoginCode(db, phone, { now, secret, dev: true })
  return verifyLoginCode(db, phone, issued.devCode!, {
    now: now + 1_000,
    secret,
    client: "app",
    deviceName,
    userAgent: `${deviceName} user agent`,
  })
}

test("R1/R3 Access Token 短期有效并绑定未撤销会话", () => {
  const db = openDb(":memory:")
  const now = Date.now()
  try {
    const session = login(db, "+8613800138000", now, "iPhone")
    const issued = createAccessToken(session.token, session.user, { now, secret })
    assert.match(issued.token, /^cj1\./)
    assert.equal(issued.expiresAt, now + 15 * 60_000)
    assert.equal(userFromAccessToken(db, issued.token, { now: now + 1_000, secret })?.id, session.user.id)
    assert.equal(userFromAccessToken(db, issued.token, { now: now + 15 * 60_000 + 1, secret }), null)
    assert.equal(revokeSessionForToken(db, issued.token, { now: now + 2_000, secret }), true)
    assert.equal(userFromAccessToken(db, issued.token, { now: now + 3_000, secret }), null)
    assert.equal(userFromSessionToken(db, session.token, now + 3_000), null)
  } finally {
    db.close()
  }
})

test("R2 Refresh Token 能换取新的 Access Token", () => {
  const db = openDb(":memory:")
  const now = Date.now()
  try {
    const session = login(db, "+8613900139000", now, "Android")
    const refreshed = refreshAccessToken(db, session.token, { now: now + 30_000, secret })
    assert.equal(refreshed?.user.id, session.user.id)
    assert.match(refreshed?.access.token || "", /^cj1\./)
    assert.equal(
      userFromAccessToken(db, refreshed!.access.token, { now: now + 31_000, secret })?.id,
      session.user.id,
    )
    assert.equal(refreshAccessToken(db, "invalid-refresh-token", { now, secret }), null)
  } finally {
    db.close()
  }
})

test("R4 会话列表按当前用户隔离并可单独撤销", () => {
  const db = openDb(":memory:")
  const now = Date.now()
  try {
    const web = login(db, "+8613700137000", now, "Web Chrome")
    const app = login(db, "+8613700137000", now + 61_000, "iPhone")
    const sessions = listUserSessions(db, web.user.id, sessionIdForTest(web.token), now + 64_000)
    assert.equal(sessions.length, 2)
    assert.equal(sessions.filter((item) => item.current).length, 1)
    assert.ok(sessions.some((item) => item.deviceName === "iPhone"))

    assert.equal(revokeUserSession(db, web.user.id, sessionIdForTest(app.token), now + 65_000), true)
    const remaining = listUserSessions(db, web.user.id, sessionIdForTest(web.token), now + 66_000)
    assert.equal(remaining.length, 1)
    assert.equal(remaining[0].deviceName, "Web Chrome")
    assert.equal(userFromSessionToken(db, app.token, now + 67_000), null)
  } finally {
    db.close()
  }
})

function sessionIdForTest(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

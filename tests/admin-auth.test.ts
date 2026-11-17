import assert from "node:assert/strict"
import test from "node:test"

import {
  ADMIN_EMAIL_ENV,
  isAdminUser,
  requireAdminUser,
} from "../lib/admin/auth.ts"

const admin = {
  id: "user_admin",
  phone: null,
  email: "admin@example.com",
  username: "admin",
  displayName: "admin",
  createdAt: 1,
}

const user = {
  ...admin,
  id: "user_normal",
  email: "creator@example.com",
  username: "creator",
  displayName: "creator",
}

test("管理员邮箱白名单大小写不敏感", () => {
  const env = { [ADMIN_EMAIL_ENV]: "ADMIN@example.com, owner@example.com" }
  assert.equal(isAdminUser(null, admin, env), true)
  assert.equal(isAdminUser(null, user, env), false)
  assert.equal(isAdminUser(null, null, env), false)
})

test("非管理员必须收到 403，而不是进入后台", () => {
  assert.throws(
    () => requireAdminUser(null, user, { [ADMIN_EMAIL_ENV]: "admin@example.com" }),
    (error: unknown) => error instanceof Error
      && "status" in error
      && (error as Error & { status: number }).status === 403,
  )
  assert.equal(
    requireAdminUser(null, admin, { [ADMIN_EMAIL_ENV]: "admin@example.com" }).id,
    "user_admin",
  )
})

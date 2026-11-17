import assert from "node:assert/strict"
import test from "node:test"

import { openDb } from "../lib/assets/db.ts"
import { createProject } from "../lib/assets/repo.ts"
import { DAILY_UNITS_PER_IDENTITY, getQuota } from "../lib/quota.ts"
import {
  listAdminUsers,
  revokeQuotaOverride,
  setQuotaOverride,
} from "../lib/admin/users.ts"

function seedUsers() {
  const db = openDb(":memory:")
  const now = 1_000_000
  db.prepare(
    "INSERT INTO users (id, phone, email, display_name, created_at, updated_at) VALUES (?, NULL, ?, ?, ?, ?)",
  ).run("user_admin", "admin@example.com", "admin", now, now)
  db.prepare(
    "INSERT INTO users (id, phone, email, display_name, created_at, updated_at) VALUES (?, NULL, ?, ?, ?, ?)",
  ).run("user_creator", "creator@example.com", "编剧小鱼", now, now)
  db.prepare("INSERT INTO admin_users (user_id, created_by, created_at) VALUES (?, ?, ?)")
    .run("user_admin", "system", now)
  const project = createProject(db, "额度项目", "user_creator")
  return { db, project, now }
}

test("额度覆盖在同一事务内更新，并立即影响额度查询", () => {
  const { db, now } = seedUsers()
  try {
    const first = setQuotaOverride(db, {
      adminUserId: "user_admin",
      targetUserId: "user_creator",
      extraUnits: 20,
      expiresAt: now + 86_400_000,
      reason: "首轮内测补充额度",
    }, now)
    assert.equal(first.extraUnits, 20)
    assert.equal(
      getQuota(db, "user_creator", now).limit,
      DAILY_UNITS_PER_IDENTITY + 20,
    )

    const updated = setQuotaOverride(db, {
      adminUserId: "user_admin",
      targetUserId: "user_creator",
      extraUnits: 35,
      expiresAt: now + 172_800_000,
      reason: "延长测试额度",
    }, now + 1)
    assert.equal(updated.extraUnits, 35)
    const rows = db.prepare(
      "SELECT COUNT(*) AS n FROM user_quota_overrides",
    ).get() as { n: number }
    assert.equal(rows.n, 1)
    assert.equal(
      getQuota(db, "user_creator", now + 2).limit,
      DAILY_UNITS_PER_IDENTITY + 35,
    )

    const audit = db.prepare(
      "SELECT action, target_user_id FROM admin_audit_log ORDER BY created_at",
    ).all() as Array<Record<string, unknown>>
    assert.equal(audit.length, 2)
    assert.deepEqual({ ...audit[0] }, {
      action: "quota_override_set",
      target_user_id: "user_creator",
    })
  } finally {
    db.close()
  }
})

test("过期覆盖不生效，撤销覆盖会写审计", () => {
  const { db, now } = seedUsers()
  try {
    setQuotaOverride(db, {
      adminUserId: "user_admin",
      targetUserId: "user_creator",
      extraUnits: 10,
      expiresAt: now + 100,
      reason: "短时额度",
    }, now)
    assert.equal(
      getQuota(db, "user_creator", now + 101).limit,
      DAILY_UNITS_PER_IDENTITY,
    )
    revokeQuotaOverride(db, {
      adminUserId: "user_admin",
      targetUserId: "user_creator",
      reason: "测试结束",
    }, now + 102)
    const remaining = db.prepare(
      "SELECT COUNT(*) AS n FROM user_quota_overrides",
    ).get() as { n: number }
    assert.equal(remaining.n, 0)
    const audit = db.prepare(
      "SELECT action FROM admin_audit_log ORDER BY created_at DESC LIMIT 1",
    ).get() as { action: string }
    assert.equal(audit.action, "quota_override_revoke")
  } finally {
    db.close()
  }
})

test("管理员用户列表可按邮箱或用户名搜索并带额度与项目数", () => {
  const { db, now } = seedUsers()
  try {
    setQuotaOverride(db, {
      adminUserId: "user_admin",
      targetUserId: "user_creator",
      extraUnits: 20,
      expiresAt: now + 86_400_000,
      reason: "内测额度",
    }, now)
    const byEmail = listAdminUsers(db, { query: "creator@", now })
    assert.equal(byEmail.length, 1)
    assert.equal(byEmail[0].username, "编剧小鱼")
    assert.equal(byEmail[0].projectCount, 1)
    assert.equal(byEmail[0].quota.extraUnits, 20)

    const byName = listAdminUsers(db, { query: "编剧", now })
    assert.equal(byName[0].id, "user_creator")
  } finally {
    db.close()
  }
})

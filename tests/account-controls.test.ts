import assert from "node:assert/strict"
import test from "node:test"

import { __resetDbForTests, getDbForRequest } from "../lib/assets/store.ts"
import { createProject, createSnapshot } from "../lib/assets/repo.ts"
import {
  completeGenerationTask,
  createGenerationTask,
  saveGeneratedAsset,
} from "../lib/generation/repo.ts"
import { buildAccountExport, deleteAccountData } from "../lib/account/service.ts"
import {
  grantBillingEntitlement,
  readBillingPurchase,
  recordBillingPurchase,
} from "../lib/billing/repo.ts"

const USER = "user_test_account"

function seedUser() {
  __resetDbForTests(":memory:")
  const db = getDbForRequest()
  db.prepare(
    "INSERT INTO users (id, phone, email, display_name, created_at, updated_at) VALUES (?, NULL, ?, ?, ?, ?)",
  ).run(USER, "export@example.com", "导出用户", 1, 1)
  const project = createProject(db, "账号导出项目", USER)
  const snapshot = createSnapshot(db, {
    projectId: project.id,
    kind: "idea",
    payload: { idea: "测试故事", genre: "suspense" },
  })
  const task = createGenerationTask(db, {
    projectId: project.id,
    targetType: "shot",
    targetId: "shot-1",
    providerId: "test",
    model: "test",
    prompt: "frame",
  })
  const asset = saveGeneratedAsset(db, {
    taskId: task.id,
    projectId: project.id,
    targetType: "shot",
    targetId: "shot-1",
    storageKey: "generated/test/frame.png",
    mime: "image/png",
    bytes: 10,
    providerId: "test",
    model: "test",
    prompt: "frame",
  })
  completeGenerationTask(db, task.id, asset.id)
  db.prepare(
    "INSERT INTO mobile_push_tokens (id, owner_id, token, platform, device_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run("push-1", USER, "ExponentPushToken[test-device]", "ios", "iPhone", 1, 1)
  return { db, project, snapshot }
}

test("账号导出包含项目、快照、任务和资产元数据", () => {
  const { db } = seedUser()
  const result = buildAccountExport(db, USER)
  assert.equal(result.user.email, "export@example.com")
  assert.equal(result.projects.length, 1)
  assert.equal(result.projects[0].snapshots.length, 1)
  assert.equal(result.projects[0].tasks.length, 1)
  assert.equal(result.projects[0].assets[0].storageKey, "generated/test/frame.png")
  assert.equal("bytes" in result.projects[0].assets[0], true)
})

test("注销账号级联删除项目、任务、Token 和用户", () => {
  const { db, project } = seedUser()
  const transaction = recordBillingPurchase(db, USER, readBillingPurchase({
    platform: "ios",
    productId: "chengju_creator_monthly",
    transactionId: "account-delete-billing",
    purchaseToken: "account-delete-token",
  }), "verified")
  grantBillingEntitlement(db, USER, transaction.id, 20, Date.now() + 60_000)
  const result = deleteAccountData(db, USER)
  assert.equal(result.deleted, true)
  assert.equal(result.projects, 1)
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM projects WHERE id = ?").get(project.id) as { n: number }).n, 0)
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM generation_tasks WHERE project_id = ?").get(project.id) as { n: number }).n, 0)
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM mobile_push_tokens WHERE owner_id = ?").get(USER) as { n: number }).n, 0)
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM billing_transactions WHERE owner_id = ?").get(USER) as { n: number }).n, 0)
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM billing_entitlements WHERE owner_id = ?").get(USER) as { n: number }).n, 0)
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM users WHERE id = ?").get(USER) as { n: number }).n, 0)
})

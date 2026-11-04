import assert from "node:assert/strict"
import test from "node:test"

import { __resetDbForTests, getDbForRequest } from "../lib/assets/store.ts"
import {
  createContentReport,
  listContentReports,
  readContentReport,
} from "../lib/trust/reports.ts"

test("内容举报校验原因并按 owner 隔离", () => {
  __resetDbForTests(":memory:")
  const db = getDbForRequest()
  const input = readContentReport({
    targetType: "asset",
    targetId: "asset-1",
    projectId: "project-1",
    reason: "copyright",
    detail: "疑似未经授权使用他人剧照",
  })
  const report = createContentReport(db, "anon_a", input)
  assert.equal(report.status, "pending")
  assert.equal(listContentReports(db, "anon_a").length, 1)
  assert.equal(listContentReports(db, "anon_b").length, 0)
})

test("内容举报拒绝未知原因和空目标", () => {
  assert.throws(() => readContentReport({
    targetType: "asset",
    targetId: "",
    reason: "copyright",
  }), /目标/)
  assert.throws(() => readContentReport({
    targetType: "asset",
    targetId: "asset-1",
    reason: "whatever",
  }), /原因/)
})

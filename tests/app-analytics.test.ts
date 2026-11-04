import assert from "node:assert/strict"
import test from "node:test"

import { __resetDbForTests, getDbForRequest } from "../lib/assets/store.ts"
import {
  readAnalyticsBatch,
  recordAnalyticsBatch,
} from "../lib/analytics/repo.ts"

test("分析事件清洗敏感字段并按 owner 写入", () => {
  __resetDbForTests(":memory:")
  const db = getDbForRequest()
  const batch = readAnalyticsBatch({
    installId: "install_1234567890",
    events: [{
      name: "app_open",
      path: "/",
      properties: {
        durationMs: 320,
        prompt: "secret",
        screen: "agent",
      },
    }],
  })
  const saved = recordAnalyticsBatch(db, "anon_a", batch)
  assert.equal(saved, 1)
  const row = db.prepare("SELECT properties_json FROM app_analytics_events").get() as { properties_json: string }
  assert.deepEqual(JSON.parse(row.properties_json), { durationMs: 320, screen: "agent" })
})

test("分析批量拒绝空事件和过长安装标识", () => {
  assert.throws(() => readAnalyticsBatch({ installId: "x", events: [] }), /安装标识/)
  assert.throws(() => readAnalyticsBatch({
    installId: "x".repeat(80),
    events: [{ name: "app_open" }],
  }), /安装标识/)
})

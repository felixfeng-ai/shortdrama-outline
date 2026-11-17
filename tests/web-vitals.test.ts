import assert from "node:assert/strict"
import test from "node:test"

import { __resetDbForTests, getDbForRequest } from "../lib/assets/store.ts"
import {
  readWebVitalEvent,
  recordWebVitalEvent,
  summarizeWebVitals,
} from "../lib/web-vitals.ts"

test("Web Vitals 输入只保留性能元数据并限制长度", () => {
  const event = readWebVitalEvent({
    name: "LCP",
    value: 1234.5,
    rating: "needs-improvement",
    path: "/workspace?project=secret",
    device: "mobile",
    connection: "4g",
    release: "abc123",
    email: "user@example.com",
    prompt: "不应保存",
  })
  assert.deepEqual(event, {
    name: "LCP",
    value: 1234.5,
    rating: "needs-improvement",
    path: "/workspace",
    device: "mobile",
    connection: "4g",
    release: "abc123",
  })
})

test("Web Vitals 拒绝未知指标、负值和非法路径", () => {
  assert.throws(() => readWebVitalEvent({ name: "FID", value: 1, path: "/" }), /指标/)
  assert.throws(() => readWebVitalEvent({ name: "LCP", value: -1, path: "/" }), /数值/)
  assert.throws(() => readWebVitalEvent({ name: "LCP", value: 1, path: "https://x" }), /路径/)
})

test("Web Vitals 持久化并按路由与端计算分位数", () => {
  __resetDbForTests(":memory:")
  const db = getDbForRequest()
  for (const value of [100, 200, 300, 400]) {
    recordWebVitalEvent(db, "user-a", readWebVitalEvent({
      name: "LCP",
      value,
      rating: "good",
      path: "/",
      device: "mobile",
      connection: "4g",
      release: "r1",
    }), 1000 + value)
  }
  const rows = summarizeWebVitals(db, { days: 7, now: 2000 })
  assert.deepEqual(rows, [{
    name: "LCP",
    path: "/",
    device: "mobile",
    samples: 4,
    p50: 200,
    p75: 300,
    p95: 400,
  }])
})

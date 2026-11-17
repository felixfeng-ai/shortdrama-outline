import assert from "node:assert/strict"
import test from "node:test"

import { POST as postVital } from "../app/api/vitals/route.ts"
import { __resetDbForTests, getDbForRequest } from "../lib/assets/store.ts"

function request(body: unknown): Request {
  return new Request("http://localhost/api/vitals", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: `chengju_sid=anon_${"v".repeat(48)}`,
    },
    body: JSON.stringify(body),
  })
}

test("Web Vitals API 接收公开性能采样并落库", async () => {
  __resetDbForTests(":memory:")
  const response = await postVital(request({
    name: "LCP",
    value: 1800,
    rating: "good",
    path: "/workspace?project=secret",
    device: "mobile",
    connection: "4g",
    release: "abc123",
  }))
  assert.equal(response.status, 200)
  const row = getDbForRequest().prepare(
    "SELECT metric_name, path, device, release FROM web_vitals_events",
  ).get() as Record<string, unknown>
  assert.deepEqual({ ...row }, {
    metric_name: "LCP",
    path: "/workspace",
    device: "mobile",
    release: "abc123",
  })
})

test("Web Vitals API 拒绝非法指标", async () => {
  __resetDbForTests(":memory:")
  const response = await postVital(request({
    name: "FID",
    value: 20,
    path: "/",
  }))
  assert.equal(response.status, 400)
})

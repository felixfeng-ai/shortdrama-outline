import assert from "node:assert/strict"
import test from "node:test"

import {
  GET as getFeedback,
  POST as postFeedback,
} from "../app/api/mobile/feedback/route.ts"
import { __resetDbForTests, getDbForRequest } from "../lib/assets/store.ts"

const OWNER_A = `anon_${"f".repeat(48)}`
const OWNER_B = `anon_${"g".repeat(48)}`

function headers(owner: string, json = false): Headers {
  const result = new Headers({ cookie: `chengju_sid=${owner}` })
  if (json) result.set("content-type", "application/json")
  return result
}

function request(body: unknown, owner = OWNER_A): Request {
  return new Request("http://localhost/api/mobile/feedback", {
    method: "POST",
    headers: headers(owner, true),
    body: JSON.stringify(body),
  })
}

test("内测反馈保存分类、正文与脱敏设备上下文，并按账号隔离", async () => {
  __resetDbForTests(":memory:")
  const created = await postFeedback(request({
    category: "video",
    body: "视频可以播放，但下载按钮没有开始。",
    appVersion: "1.1.0",
    buildVersion: "12",
    platform: "android",
    osVersion: "36",
    deviceModel: "Redmi",
    screen: "/review/shot-1",
  }))
  const createdPayload = await created.json()

  assert.equal(created.status, 200)
  assert.match(createdPayload.data.feedback.id, /^feedback_/)
  assert.equal(createdPayload.data.feedback.status, "open")
  assert.equal(createdPayload.data.feedback.category, "video")

  const own = await getFeedback(new Request(
    "http://localhost/api/mobile/feedback",
    { headers: headers(OWNER_A) },
  ))
  const ownPayload = await own.json()
  assert.equal(ownPayload.data.feedback.length, 1)
  assert.equal(ownPayload.data.feedback[0].deviceModel, "Redmi")

  const foreign = await getFeedback(new Request(
    "http://localhost/api/mobile/feedback",
    { headers: headers(OWNER_B) },
  ))
  assert.deepEqual((await foreign.json()).data.feedback, [])

  const row = getDbForRequest().prepare(
    "SELECT category, body, app_version, platform FROM mobile_feedback",
  ).get() as Record<string, unknown>
  assert.deepEqual({ ...row }, {
    category: "video",
    body: "视频可以播放，但下载按钮没有开始。",
    app_version: "1.1.0",
    platform: "android",
  })
})

test("内测反馈拒绝空正文、过短正文和未知分类", async () => {
  __resetDbForTests(":memory:")
  const empty = await postFeedback(request({ category: "other", body: "" }))
  assert.equal(empty.status, 400)

  const short = await postFeedback(request({ category: "other", body: "坏" }))
  assert.equal(short.status, 400)

  const invalid = await postFeedback(request({ category: "unknown", body: "这是一个有效反馈正文" }))
  assert.equal(invalid.status, 400)
})

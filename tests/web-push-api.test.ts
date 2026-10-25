import { test } from "node:test"
import assert from "node:assert/strict"

import {
  DELETE as deleteSubscription,
  GET as getPushConfig,
  POST as saveSubscription,
} from "../app/api/push/subscription/route.ts"
import { __resetDbForTests, getDbForRequest } from "../lib/assets/store.ts"
import { listPushSubscriptions } from "../lib/push/repo.ts"

const OWNER = `anon_${"u".repeat(48)}`
const endpoint = "https://fcm.googleapis.com/fcm/send/api-device"

function request(method: string, body?: unknown): Request {
  return new Request("http://localhost/api/push/subscription", {
    method,
    headers: {
      cookie: `chengju_sid=${OWNER}`,
      "content-type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

test("Web Push 配置接口只返回公开密钥，不泄露私钥", async () => {
  const originalPublic = process.env.WEB_PUSH_PUBLIC_KEY
  const originalPrivate = process.env.WEB_PUSH_PRIVATE_KEY
  process.env.WEB_PUSH_PUBLIC_KEY = "public-key"
  process.env.WEB_PUSH_PRIVATE_KEY = "private-key"
  try {
    const response = await getPushConfig()
    const payload = await response.json()
    assert.equal(response.status, 200)
    assert.equal(payload.data.enabled, true)
    assert.equal(payload.data.publicKey, "public-key")
    assert.equal(JSON.stringify(payload).includes("private-key"), false)
  } finally {
    if (originalPublic === undefined) delete process.env.WEB_PUSH_PUBLIC_KEY
    else process.env.WEB_PUSH_PUBLIC_KEY = originalPublic
    if (originalPrivate === undefined) delete process.env.WEB_PUSH_PRIVATE_KEY
    else process.env.WEB_PUSH_PRIVATE_KEY = originalPrivate
  }
})

test("Web Push 订阅保存、幂等更新和关闭都按当前 owner 隔离", async () => {
  __resetDbForTests(":memory:")
  const originalPublic = process.env.WEB_PUSH_PUBLIC_KEY
  const originalPrivate = process.env.WEB_PUSH_PRIVATE_KEY
  process.env.WEB_PUSH_PUBLIC_KEY = "public-key"
  process.env.WEB_PUSH_PRIVATE_KEY = "private-key"
  try {
    const first = await saveSubscription(request("POST", {
      subscription: {
        endpoint,
        keys: { p256dh: "old-key", auth: "old-auth" },
      },
    }))
    assert.equal(first.status, 200)

    const second = await saveSubscription(request("POST", {
      subscription: {
        endpoint,
        keys: { p256dh: "new-key", auth: "new-auth" },
      },
    }))
    assert.equal(second.status, 200)
    const db = getDbForRequest()
    const saved = listPushSubscriptions(db, OWNER)
    assert.equal(saved.length, 1)
    assert.equal(saved[0].keys.p256dh, "new-key")

    const removed = await deleteSubscription(request("DELETE", { endpoint }))
    assert.equal(removed.status, 200)
    assert.equal(listPushSubscriptions(db, OWNER).length, 0)
  } finally {
    if (originalPublic === undefined) delete process.env.WEB_PUSH_PUBLIC_KEY
    else process.env.WEB_PUSH_PUBLIC_KEY = originalPublic
    if (originalPrivate === undefined) delete process.env.WEB_PUSH_PRIVATE_KEY
    else process.env.WEB_PUSH_PRIVATE_KEY = originalPrivate
  }
})

test("Web Push 拒绝非浏览器推送端点", async () => {
  __resetDbForTests(":memory:")
  const response = await saveSubscription(request("POST", {
    subscription: {
      endpoint: "https://attacker.example.com/push",
      keys: { p256dh: "key", auth: "auth" },
    },
  }))
  assert.equal(response.status, 400)
})

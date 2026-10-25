import { test } from "node:test"
import assert from "node:assert/strict"

import { openDb } from "../lib/assets/db.ts"
import {
  listPushSubscriptions,
  upsertPushSubscription,
} from "../lib/push/repo.ts"
import {
  notifyGenerationFinished,
  sendPushToOwner,
} from "../lib/push/service.ts"

const owner = `anon_${"s".repeat(48)}`
const payload = {
  title: "定妆图已生成",
  body: "打开成剧查看最新关键帧并决定是否采用。",
  url: "/?step=visuals",
  tag: "generation-task-1",
}

test("Web Push 失效 410 订阅会被清理，其他设备仍继续发送", async () => {
  const db = openDb(":memory:")
  try {
    upsertPushSubscription(db, owner, {
      endpoint: "https://fcm.googleapis.com/fcm/send/live",
      keys: { p256dh: "live-key", auth: "live-auth" },
    })
    upsertPushSubscription(db, owner, {
      endpoint: "https://fcm.googleapis.com/fcm/send/gone",
      keys: { p256dh: "gone-key", auth: "gone-auth" },
    })
    const sentEndpoints: string[] = []
    const result = await sendPushToOwner(db, owner, payload, {
      env: {
        WEB_PUSH_PUBLIC_KEY: "public",
        WEB_PUSH_PRIVATE_KEY: "private",
        WEB_PUSH_SUBJECT: "mailto:test@example.com",
      },
      sendNotification: async (subscription) => {
        sentEndpoints.push(subscription.endpoint)
        if (subscription.endpoint.endsWith("/gone")) {
          throw Object.assign(new Error("gone"), { statusCode: 410 })
        }
        return {}
      },
    })

    assert.deepEqual(result, { sent: 1, failed: 1, removed: 1 })
    assert.equal(sentEndpoints.length, 2)
    const remaining = listPushSubscriptions(db, owner)
    assert.deepEqual(remaining.map((item) => item.endpoint), [
      "https://fcm.googleapis.com/fcm/send/live",
    ])
  } finally {
    db.close()
  }
})

test("Web Push 未配置时静默跳过，不影响生成接口", async () => {
  const db = openDb(":memory:")
  let called = false
  try {
    const result = await sendPushToOwner(db, owner, payload, {
      env: {},
      sendNotification: async () => {
        called = true
        return {}
      },
    })
    assert.deepEqual(result, { sent: 0, failed: 0, removed: 0 })
    assert.equal(called, false)
  } finally {
    db.close()
  }
})

test("生成结果封装成功通知，取消任务不发送", async () => {
  const db = openDb(":memory:")
  try {
    upsertPushSubscription(db, owner, {
      endpoint: "https://fcm.googleapis.com/fcm/send/notify",
      keys: { p256dh: "notify-key", auth: "notify-auth" },
    })
    const bodies: string[] = []
    const result = await notifyGenerationFinished(db, owner, {
      taskId: "task-notify",
      targetType: "shot",
      status: "succeeded",
    }, {
      env: {
        WEB_PUSH_PUBLIC_KEY: "public",
        WEB_PUSH_PRIVATE_KEY: "private",
      },
      sendNotification: async (_subscription, body) => {
        bodies.push(body)
        return {}
      },
    })
    assert.deepEqual(result, { sent: 1, failed: 0, removed: 0 })
    assert.equal(JSON.parse(bodies[0]).title, "镜头首帧已生成")
    assert.equal(JSON.parse(bodies[0]).url, "/?step=shots")

    const canceled = await notifyGenerationFinished(db, owner, {
      taskId: "task-canceled",
      targetType: "shot",
      status: "canceled",
    }, {
      env: {
        WEB_PUSH_PUBLIC_KEY: "public",
        WEB_PUSH_PRIVATE_KEY: "private",
      },
      sendNotification: async () => {
        throw new Error("不应发送")
      },
    })
    assert.deepEqual(canceled, { sent: 0, failed: 0, removed: 0 })
  } finally {
    db.close()
  }
})

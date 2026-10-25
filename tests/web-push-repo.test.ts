import { test } from "node:test"
import assert from "node:assert/strict"

import { openDb } from "../lib/assets/db.ts"
import {
  listPushSubscriptions,
  removePushSubscription,
  upsertPushSubscription,
} from "../lib/push/repo.ts"

const ownerA = `anon_${"p".repeat(48)}`
const ownerB = `anon_${"q".repeat(48)}`
const endpoint = "https://fcm.googleapis.com/fcm/send/device-a"

test("Web Push 订阅持久化，同 endpoint 幂等更新且按 owner 隔离", () => {
  const db = openDb(":memory:")
  try {
    const first = upsertPushSubscription(db, ownerA, {
      endpoint,
      keys: { p256dh: "old-key", auth: "old-auth" },
    })
    assert.ok(first.id)
    assert.equal(first.createdAt > 0, true)

    const second = upsertPushSubscription(db, ownerA, {
      endpoint,
      keys: { p256dh: "new-key", auth: "new-auth" },
    })
    assert.equal(second.id, first.id)
    assert.equal(second.keys.p256dh, "new-key")
    assert.equal(listPushSubscriptions(db, ownerA).length, 1)
    assert.equal(listPushSubscriptions(db, ownerB).length, 0)

    assert.equal(removePushSubscription(db, ownerB, endpoint), false)
    assert.equal(listPushSubscriptions(db, ownerA).length, 1)
    assert.equal(removePushSubscription(db, ownerA, endpoint), true)
    assert.equal(listPushSubscriptions(db, ownerA).length, 0)
  } finally {
    db.close()
  }
})

import assert from "node:assert/strict"
import test from "node:test"

import { __resetDbForTests, getDbForRequest } from "../lib/assets/store.ts"
import {
  listNativePushTokens,
  removeNativePushToken,
  upsertNativePushToken,
} from "../lib/push/native-repo.ts"

const OWNER_A = `anon_${"a".repeat(48)}`
const OWNER_B = `anon_${"b".repeat(48)}`

test("原生推送 Token 幂等保存并按 owner 隔离", () => {
  __resetDbForTests(":memory:")
  const db = getDbForRequest()
  const first = upsertNativePushToken(db, OWNER_A, {
    token: "ExponentPushToken[device-a]",
    platform: "ios",
    deviceName: "iPhone A",
  })
  const updated = upsertNativePushToken(db, OWNER_A, {
    token: first.token,
    platform: "ios",
    deviceName: "iPhone A2",
  })
  upsertNativePushToken(db, OWNER_B, {
    token: "ExponentPushToken[device-b]",
    platform: "android",
    deviceName: "Android B",
  })

  assert.equal(updated.id, first.id)
  assert.equal(listNativePushTokens(db, OWNER_A).length, 1)
  assert.equal(listNativePushTokens(db, OWNER_A)[0].deviceName, "iPhone A2")
  assert.equal(listNativePushTokens(db, OWNER_B).length, 1)
  assert.equal(removeNativePushToken(db, OWNER_A, first.token), true)
  assert.equal(listNativePushTokens(db, OWNER_A).length, 0)
})

test("原生推送 Token 拒绝非 Expo Token", () => {
  __resetDbForTests(":memory:")
  const db = getDbForRequest()
  assert.throws(
    () => upsertNativePushToken(db, OWNER_A, {
      token: "not-a-token",
      platform: "ios",
      deviceName: "iPhone",
    }),
    /Token/,
  )
})

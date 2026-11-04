import assert from "node:assert/strict"
import test from "node:test"

import { __resetDbForTests, getDbForRequest } from "../lib/assets/store.ts"
import {
  readBillingPurchase,
  recordBillingPurchase,
} from "../lib/billing/repo.ts"

test("购买交易幂等保存并按 owner 隔离", () => {
  __resetDbForTests(":memory:")
  const db = getDbForRequest()
  const input = readBillingPurchase({
    platform: "ios",
    productId: "chengju_creator_monthly",
    transactionId: "tx-100",
    purchaseToken: "receipt-secret",
  })
  const first = recordBillingPurchase(db, "user_a", input, "pending")
  const second = recordBillingPurchase(db, "user_a", input, "pending")
  recordBillingPurchase(db, "user_b", {
    ...input,
    transactionId: "tx-200",
  }, "pending")

  assert.equal(first.id, second.id)
  assert.equal(second.status, "pending")
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM billing_transactions WHERE owner_id = 'user_a'").get() as { n: number }).n, 1)
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM billing_transactions WHERE owner_id = 'user_b'").get() as { n: number }).n, 1)
})

test("购买凭据校验拒绝缺失字段和外部支付平台", () => {
  assert.throws(() => readBillingPurchase({ platform: "web" }), /平台/)
  assert.throws(
    () => readBillingPurchase({
      platform: "android",
      productId: "plan",
      transactionId: "tx",
      purchaseToken: "",
    }),
    /凭据/,
  )
})

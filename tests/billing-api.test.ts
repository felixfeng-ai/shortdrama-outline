import assert from "node:assert/strict"
import test from "node:test"

import { __resetDbForTests, getDbForRequest } from "../lib/assets/store.ts"
import {
  createAccessToken,
  requestEmailLoginCode,
  verifyEmailLoginCode,
} from "../lib/auth/service.ts"
import {
  readBillingPurchase,
  recordBillingPurchase,
} from "../lib/billing/repo.ts"
import { DAILY_UNITS_PER_IDENTITY, getQuota } from "../lib/quota.ts"
import { POST as verifyBillingPurchase } from "../app/api/mobile/billing/verify/route.ts"

function authenticatedRequest(accessToken: string, transactionId: string): Request {
  return new Request("http://localhost/api/mobile/billing/verify", {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      platform: "ios",
      productId: "chengju_creator_monthly",
      transactionId,
      purchaseToken: `receipt-${transactionId}`,
    }),
  })
}

function seedAuthenticatedUser() {
  const secret = "billing-api-test-secret"
  const db = getDbForRequest()
  const email = "billing@example.com"
  const issued = requestEmailLoginCode(db, email, { secret, dev: true })
  const session = verifyEmailLoginCode(db, email, issued.code, {
    secret,
    client: "app",
  })
  const access = createAccessToken(session.token, session.user, { secret })
  return { db, secret, accessToken: access.token, userId: session.user.id }
}

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

test("核验通过后额度到账，重复提交同一交易不重复发放", async () => {
  __resetDbForTests(":memory:")
  const { db, secret, accessToken, userId } = seedAuthenticatedUser()
  const previousSecret = process.env.AUTH_SECRET
  const previousVerifier = process.env.BILLING_VERIFICATION_URL
  const originalFetch = globalThis.fetch
  process.env.AUTH_SECRET = secret
  process.env.BILLING_VERIFICATION_URL = "https://billing-verifier.test/verify"
  globalThis.fetch = (async () => Response.json({
    verified: true,
    entitlement: {
      units: 24,
      expiresAt: Date.now() + 30 * 24 * 60 * 60_000,
    },
  })) as typeof fetch

  try {
    for (let index = 0; index < 2; index += 1) {
      const response = await verifyBillingPurchase(
        authenticatedRequest(accessToken, "tx-verified-once"),
      )
      const payload = await response.json() as {
        success: boolean
        data: { verified: boolean; status: string }
      }
      assert.equal(response.status, 200)
      assert.equal(payload.success, true)
      assert.equal(payload.data.verified, true)
      assert.equal(payload.data.status, "verified")
    }

    assert.equal(
      getQuota(db, userId).limit,
      DAILY_UNITS_PER_IDENTITY + 24,
    )
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS n FROM billing_entitlements WHERE owner_id = ?")
        .get(userId) as { n: number }).n,
      1,
    )
  } finally {
    globalThis.fetch = originalFetch
    if (previousSecret === undefined) delete process.env.AUTH_SECRET
    else process.env.AUTH_SECRET = previousSecret
    if (previousVerifier === undefined) delete process.env.BILLING_VERIFICATION_URL
    else process.env.BILLING_VERIFICATION_URL = previousVerifier
  }
})

test("未核验的交易不增加额度", async () => {
  __resetDbForTests(":memory:")
  const { db, secret, accessToken, userId } = seedAuthenticatedUser()
  const previousSecret = process.env.AUTH_SECRET
  const previousVerifier = process.env.BILLING_VERIFICATION_URL
  const originalFetch = globalThis.fetch
  process.env.AUTH_SECRET = secret

  try {
    delete process.env.BILLING_VERIFICATION_URL
    const pending = await verifyBillingPurchase(
      authenticatedRequest(accessToken, "tx-pending"),
    )
    assert.equal((await pending.json()).data.status, "pending")
    assert.equal(getQuota(db, userId).limit, DAILY_UNITS_PER_IDENTITY)

    process.env.BILLING_VERIFICATION_URL = "https://billing-verifier.test/verify"
    globalThis.fetch = (async () => Response.json({ verified: false })) as typeof fetch
    const rejected = await verifyBillingPurchase(
      authenticatedRequest(accessToken, "tx-rejected"),
    )
    assert.equal((await rejected.json()).data.status, "rejected")
    assert.equal(getQuota(db, userId).limit, DAILY_UNITS_PER_IDENTITY)
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS n FROM billing_entitlements WHERE owner_id = ?")
        .get(userId) as { n: number }).n,
      0,
    )
  } finally {
    globalThis.fetch = originalFetch
    if (previousSecret === undefined) delete process.env.AUTH_SECRET
    else process.env.AUTH_SECRET = previousSecret
    if (previousVerifier === undefined) delete process.env.BILLING_VERIFICATION_URL
    else process.env.BILLING_VERIFICATION_URL = previousVerifier
  }
})

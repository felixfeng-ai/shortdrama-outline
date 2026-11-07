import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

import { openDb } from "../lib/assets/db.ts"
import { forecastQuota } from "../lib/quota-forecast.ts"
import {
  getQuota,
  reserveQuota,
} from "../lib/quota.ts"
import {
  enforceApiRateLimit,
  getApiRateLimitAvailability,
} from "../lib/security/api-rate-limit.ts"

const ADMIN_EMAIL = "felix@chenju.work"

function adminRequest(): Request {
  return new Request("http://localhost/api/generations", {
    method: "POST",
    headers: {
      "x-real-ip": "203.0.113.91",
      cookie: "chengju_sid=user_unlimited_admin",
    },
  })
}

function seedAdmin(db: ReturnType<typeof openDb>): void {
  const now = Date.now()
  db.prepare(
    `INSERT INTO users (id, phone, email, display_name, created_at, updated_at)
     VALUES (?, NULL, ?, ?, ?, ?)`,
  ).run("user_unlimited_admin", ADMIN_EMAIL, "内部管理员", now, now)
}

test("UQ1 whitelisted account reports unlimited quota and bypasses usage ceilings", () => {
  const previous = process.env.UNLIMITED_QUOTA_ACCOUNTS
  process.env.UNLIMITED_QUOTA_ACCOUNTS = `nobody@example.com, ${ADMIN_EMAIL}`
  const db = openDb(":memory:")
  const now = 1_700_000_000_000
  try {
    seedAdmin(db)
    const quota = getQuota(db, "user_unlimited_admin", now)
    assert.equal(quota.unlimited, true)
    assert.equal(quota.remaining, Number.MAX_SAFE_INTEGER)

    const reservation = reserveQuota(db, "user_unlimited_admin", "image", {
      units: 100_000,
      requestId: "unlimited-large-reservation",
      now,
    })
    assert.equal(reservation.status, "reserved")
    assert.equal(reservation.units, 100_000)
  } finally {
    db.close()
    if (previous === undefined) delete process.env.UNLIMITED_QUOTA_ACCOUNTS
    else process.env.UNLIMITED_QUOTA_ACCOUNTS = previous
  }
})

test("UQ2 whitelisted account bypasses short-window API limits without polluting buckets", () => {
  const previous = process.env.UNLIMITED_QUOTA_ACCOUNTS
  process.env.UNLIMITED_QUOTA_ACCOUNTS = ADMIN_EMAIL
  const db = openDb(":memory:")
  const env = {
    API_IMAGE_IP_10M_LIMIT: "1",
    API_IMAGE_IDENTITY_10M_LIMIT: "1",
    API_IMAGE_GLOBAL_DAILY_LIMIT: "1",
  }
  try {
    seedAdmin(db)
    enforceApiRateLimit(db, adminRequest(), "image", {
      identity: "user_unlimited_admin",
      env,
      now: 100,
    })
    enforceApiRateLimit(db, adminRequest(), "image", {
      identity: "user_unlimited_admin",
      env,
      now: 101,
    })
    const rows = db.prepare("SELECT COUNT(*) AS n FROM auth_rate_limits").get() as { n: number }
    assert.equal(rows.n, 0)

    const availability = getApiRateLimitAvailability(db, adminRequest(), "image", {
      identity: "user_unlimited_admin",
      env,
      now: 102,
    })
    assert.equal(availability.unlimited, true)
    assert.equal(availability.remaining, Number.MAX_SAFE_INTEGER)
  } finally {
    db.close()
    if (previous === undefined) delete process.env.UNLIMITED_QUOTA_ACCOUNTS
    else process.env.UNLIMITED_QUOTA_ACCOUNTS = previous
  }
})

test("UQ3 non-whitelisted accounts keep normal quota and rate limits", () => {
  const previous = process.env.UNLIMITED_QUOTA_ACCOUNTS
  process.env.UNLIMITED_QUOTA_ACCOUNTS = ADMIN_EMAIL
  const db = openDb(":memory:")
  try {
    const quota = getQuota(db, "user_regular")
    assert.equal(quota.unlimited, false)
    assert.ok(quota.remaining < Number.MAX_SAFE_INTEGER)
  } finally {
    db.close()
    if (previous === undefined) delete process.env.UNLIMITED_QUOTA_ACCOUNTS
    else process.env.UNLIMITED_QUOTA_ACCOUNTS = previous
  }
})

test("UQ4 unlimited state is visible in quota UI, batch UI, deployment and agent tools", () => {
  const quotaBar = fs.readFileSync("components/QuotaBar.tsx", "utf8")
  const batchPanel = fs.readFileSync("components/BatchGenerationPanel.tsx", "utf8")
  const agentTools = fs.readFileSync("lib/agent/tools.ts", "utf8")
  const workflow = fs.readFileSync(".github/workflows/deploy.yml", "utf8")
  const deployEnv = fs.readFileSync("scripts/apply-deploy-env.mjs", "utf8")
  const envExample = fs.readFileSync(".env.example", "utf8")

  assert.match(quotaBar, /管理账号 · 无限额度/)
  assert.match(batchPanel, /管理账号 · 无限额度/)
  assert.match(agentTools, /无限额度/)
  assert.match(workflow, /UNLIMITED_QUOTA_ACCOUNTS:\s*"felix@chenju\.work"/)
  assert.doesNotMatch(workflow, /support@chenju\.work/)
  assert.doesNotMatch(workflow, /secrets\.UNLIMITED_QUOTA_ACCOUNTS/)
  assert.match(deployEnv, /UNLIMITED_QUOTA_ACCOUNTS/)
  assert.match(envExample, /UNLIMITED_QUOTA_ACCOUNTS/)
})

test("UQ5 unlimited step forecast never claims quota is tight", () => {
  const quote = forecastQuota(30, Number.MAX_SAFE_INTEGER, true)
  assert.equal(quote.affordable, true)
  assert.equal(quote.shortBy, 0)
  assert.match(quote.label, /管理账号无限额度/)
})

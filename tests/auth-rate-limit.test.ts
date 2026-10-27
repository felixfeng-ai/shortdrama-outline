import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { openDb } from "../lib/assets/db.ts"
import {
  clientIpFromRequest,
  enforceVerificationRateLimits,
} from "../lib/auth/rate-limit.ts"

function req(headers: Record<string, string> = {}): Request {
  return new Request("https://chenju.work/api/auth/email/request-code", {
    method: "POST",
    headers,
  })
}

const baseEnv = {
  AUTH_CODE_IP_10M_LIMIT: "5",
  AUTH_CODE_IP_DAILY_LIMIT: "20",
  AUTH_CODE_GLOBAL_DAILY_LIMIT: "500",
}

test("R1 来源只信任代理写入的 X-Real-IP，不信任可伪造的 X-Forwarded-For", () => {
  assert.equal(clientIpFromRequest(req({
    "x-real-ip": "203.0.113.9",
    "x-forwarded-for": "198.51.100.7, 10.0.0.2",
  })), "203.0.113.9")
  assert.equal(clientIpFromRequest(req({
    "x-forwarded-for": "198.51.100.7, 10.0.0.2",
  })), "unknown")
  assert.equal(clientIpFromRequest(req({ "x-real-ip": " 203.0.113.9 " })), "203.0.113.9")
})

test("R2 同一 IP 十分钟内第 6 次请求被拒绝", () => {
  const db = openDb(":memory:")
  const now = Date.now()
  try {
    const request = req({ "x-real-ip": "203.0.113.10" })
    for (let i = 0; i < 5; i += 1) {
      enforceVerificationRateLimits(db, request, { now: now + i, env: baseEnv })
    }
    assert.throws(
      () => enforceVerificationRateLimits(db, request, { now: now + 6, env: baseEnv }),
      /过于频繁/,
    )
  } finally {
    db.close()
  }
})

test("R3 不同 IP 独立计数，十分钟窗口结束后恢复", () => {
  const db = openDb(":memory:")
  const now = Date.now()
  try {
    const first = req({ "x-real-ip": "203.0.113.11" })
    const second = req({ "x-real-ip": "203.0.113.12" })
    for (let i = 0; i < 5; i += 1) {
      enforceVerificationRateLimits(db, first, { now: now + i, env: baseEnv })
    }
    enforceVerificationRateLimits(db, second, { now: now + 10, env: baseEnv })
    enforceVerificationRateLimits(db, first, {
      now: now + 10 * 60_000 + 100,
      env: baseEnv,
    })
  } finally {
    db.close()
  }
})

test("R4 全站每日额度用尽后，不同 IP 也统一拒绝", () => {
  const db = openDb(":memory:")
  const now = Date.now()
  const env = { ...baseEnv, AUTH_CODE_GLOBAL_DAILY_LIMIT: "2" }
  try {
    enforceVerificationRateLimits(db, req({ "x-real-ip": "203.0.113.21" }), { now, env })
    enforceVerificationRateLimits(db, req({ "x-real-ip": "203.0.113.22" }), { now: now + 1, env })
    assert.throws(
      () => enforceVerificationRateLimits(
        db,
        req({ "x-real-ip": "203.0.113.23" }),
        { now: now + 2, env },
      ),
      /请求过多/,
    )
  } finally {
    db.close()
  }
})

test("R5 限流计数落盘，服务重启后仍保留", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "chengju-rate-limit-"))
  const dbPath = path.join(dir, "rate.db")
  const now = Date.now()
  const request = req({ "x-real-ip": "203.0.113.31" })
  try {
    const first = openDb(dbPath)
    try {
      for (let i = 0; i < 5; i += 1) {
        enforceVerificationRateLimits(first, request, { now: now + i, env: baseEnv })
      }
    } finally {
      first.close()
    }

    const reopened = openDb(dbPath)
    try {
      assert.throws(
        () => enforceVerificationRateLimits(reopened, request, { now: now + 10, env: baseEnv }),
        /过于频繁/,
      )
    } finally {
      reopened.close()
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

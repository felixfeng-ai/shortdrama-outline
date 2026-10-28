import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { openDb } from "../lib/assets/db.ts"
import { errorResponse } from "../lib/api.ts"
import { __resetDbForTests, getDbForRequest } from "../lib/assets/store.ts"
import { POST as generateIdeas } from "../app/api/ideas/route.ts"
import {
  API_RATE_LIMIT_POLICIES,
  RequestRateLimitError,
  enforceApiRateLimit,
} from "../lib/security/api-rate-limit.ts"

const baseEnv = {
  API_MODEL_IP_10M_LIMIT: "2",
  API_MODEL_IDENTITY_10M_LIMIT: "2",
  API_MODEL_GLOBAL_DAILY_LIMIT: "20",
}

function req(ip: string, owner = `anon_${"r".repeat(48)}`): Request {
  return new Request("http://localhost/api/ideas", {
    method: "POST",
    headers: {
      "x-real-ip": ip,
      cookie: `chengju_sid=${owner}`,
    },
  })
}

test("RG1 同 IP 超过文本生成窗口后拒绝，并给出 Retry-After", () => {
  const db = openDb(":memory:")
  const now = 1_700_000_000_000
  try {
    const identity = "anon_identity_ip"
    enforceApiRateLimit(db, req("203.0.113.10"), "model", {
      identity,
      env: baseEnv,
      now,
    })
    enforceApiRateLimit(db, req("203.0.113.10"), "model", {
      identity,
      env: { ...baseEnv, API_MODEL_IDENTITY_10M_LIMIT: "10" },
      now: now + 1,
    })

    assert.throws(
      () => enforceApiRateLimit(db, req("203.0.113.10"), "model", {
        identity,
        env: { ...baseEnv, API_MODEL_IDENTITY_10M_LIMIT: "10" },
        now: now + 2,
      }),
      (error: unknown) => {
        assert.ok(error instanceof RequestRateLimitError)
        assert.equal(error.status, 429)
        assert.ok(error.retryAfterSeconds >= 1)
        return true
      },
    )

    const { body, status, headers } = errorResponse(
      new RequestRateLimitError("请求过于频繁，请稍后再试", 120),
    )
    assert.equal(status, 429)
    assert.equal(body.error, "请求过于频繁，请稍后再试")
    assert.equal(headers["Retry-After"], "120")
  } finally {
    db.close()
  }
})

test("RG2 轮换 IP 不能绕过账号维度限流", () => {
  const db = openDb(":memory:")
  try {
    const env = {
      API_MODEL_IP_10M_LIMIT: "10",
      API_MODEL_IDENTITY_10M_LIMIT: "1",
      API_MODEL_GLOBAL_DAILY_LIMIT: "20",
    }
    enforceApiRateLimit(db, req("203.0.113.20"), "model", {
      identity: "user_same",
      env,
      now: 10,
    })
    assert.throws(
      () => enforceApiRateLimit(db, req("203.0.113.21"), "model", {
        identity: "user_same",
        env,
        now: 11,
      }),
      /频繁/,
    )
  } finally {
    db.close()
  }
})

test("RG3 被拒绝的请求不递增任何窗口，数据库重开后计数仍在", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "chengju-rate-limit-"))
  const file = path.join(dir, "guard.db")
  const env = {
    API_EXPORT_IP_10M_LIMIT: "1",
    API_EXPORT_IDENTITY_10M_LIMIT: "10",
    API_EXPORT_GLOBAL_DAILY_LIMIT: "20",
  }
  try {
    const first = openDb(file)
    enforceApiRateLimit(first, req("203.0.113.30"), "export", {
      identity: "user_export",
      env,
      now: 100,
    })
    assert.throws(
      () => enforceApiRateLimit(first, req("203.0.113.30"), "export", {
        identity: "user_export",
        env,
        now: 101,
      }),
      RequestRateLimitError,
    )
    const row = first.prepare(
      "SELECT count FROM auth_rate_limits WHERE bucket = ? AND subject = ?",
    ).get("api:export:ip:10m", "203.0.113.30") as { count: number }
    assert.equal(row.count, 1)
    first.close()

    const reopened = openDb(file)
    assert.throws(
      () => enforceApiRateLimit(reopened, req("203.0.113.30"), "export", {
        identity: "user_export",
        env,
        now: 102,
      }),
      RequestRateLimitError,
    )
    reopened.close()
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test("RG4 所有付费和文件入口都声明对应限流策略", () => {
  assert.equal(API_RATE_LIMIT_POLICIES.model.group, "model")
  assert.equal(API_RATE_LIMIT_POLICIES.assistant.group, "assistant")
  assert.equal(API_RATE_LIMIT_POLICIES.image.group, "image")
  assert.equal(API_RATE_LIMIT_POLICIES.export.group, "export")
  assert.equal(API_RATE_LIMIT_POLICIES.import.group, "import")
})

test("RG5 模型与文件路由都接上限流，且早于额度扣减", () => {
  const routes: Array<[string, string]> = [
    ["app/api/ideas/route.ts", "model"],
    ["app/api/characters/route.ts", "model"],
    ["app/api/acts/route.ts", "model"],
    ["app/api/episodes/route.ts", "model"],
    ["app/api/scenes/route.ts", "model"],
    ["app/api/shots/route.ts", "model"],
    ["app/api/visual/route.ts", "model"],
    ["app/api/asset-match/route.ts", "model"],
    ["app/api/agent/route.ts", "assistant"],
    ["app/api/assistant/route.ts", "assistant"],
    ["app/api/generations/route.ts", "image"],
    ["app/api/export/route.ts", "export"],
    ["app/api/project-import/route.ts", "import"],
  ]

  for (const [file, group] of routes) {
    const source = fs.readFileSync(file, "utf8")
    const guard = source.indexOf("enforceApiRateLimit(")
    assert.ok(guard >= 0, `${file} 没有接入统一限流`)
    assert.ok(source.includes(`"${group}"`), `${file} 没有使用 ${group} 策略`)
    const charge = source.indexOf("chargeQuota(")
    if (charge >= 0) {
      assert.ok(guard < charge, `${file} 的限流必须早于额度扣减`)
    }
  }
})

test("RG6 真实模型路由在调用模型前返回 429 与 Retry-After", async () => {
  const keys = [
    "API_MODEL_IP_10M_LIMIT",
    "API_MODEL_IDENTITY_10M_LIMIT",
    "API_MODEL_GLOBAL_DAILY_LIMIT",
  ] as const
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]))
  process.env.API_MODEL_IP_10M_LIMIT = "1"
  process.env.API_MODEL_IDENTITY_10M_LIMIT = "10"
  process.env.API_MODEL_GLOBAL_DAILY_LIMIT = "20"
  __resetDbForTests(":memory:")
  try {
    const db = getDbForRequest()
    db.prepare(
      `INSERT INTO auth_rate_limits
        (bucket, subject, window_started_at, count, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run("api:model:ip:10m", "203.0.113.77", Date.now() - 1_000, 1, Date.now())

    const response = await generateIdeas(new Request("http://localhost/api/ideas", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-real-ip": "203.0.113.77",
        cookie: `chengju_sid=anon_${"i".repeat(48)}`,
      },
      body: JSON.stringify({ keywords: "快递员", genre: "none" }),
    }))
    assert.equal(response.status, 429)
    assert.ok(Number(response.headers.get("retry-after")) >= 1)
    const payload = await response.json() as { success: boolean; error: string }
    assert.equal(payload.success, false)
    assert.match(payload.error, /频繁/)
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key]
      else process.env[key] = previous[key]
    }
    __resetDbForTests(":memory:")
  }
})

import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

import { ApiRequestError } from "../lib/api.ts"
import { runBatchGeneration, type BatchGenerationTarget } from "../lib/generation/batch.ts"

function target(key: string): BatchGenerationTarget {
  return {
    key,
    targetType: "character",
    targetId: key,
    name: key,
    detail: "角色定妆",
    prompt: "portrait",
    aspect: "portrait",
  }
}

test("BATCH11 image batch exposes rate limit balance and reset countdown", () => {
  const panel = fs.readFileSync("components/BatchGenerationPanel.tsx", "utf8")
  const client = fs.readFileSync("lib/generation/client.ts", "utf8")
  const route = fs.readFileSync("app/api/generations/rate-limit/route.ts", "utf8")
  const api = fs.readFileSync("lib/api.ts", "utf8")

  assert.match(panel, /fetchImageGenerationRateLimit/)
  assert.match(panel, /本轮还可提交/)
  assert.match(panel, /selectedOverLimit/)
  assert.match(client, /generations\/rate-limit/)
  assert.match(route, /getApiRateLimitAvailability/)
  assert.match(api, /Retry-After/)
  assert.match(api, /retryAfterSeconds/)
})

test("BATCH12 a 429 pauses the remaining image queue instead of cascading failures", async () => {
  let calls = 0
  const outcomes = await runBatchGeneration(
    [target("a"), target("b"), target("c"), target("d")],
    {
      concurrency: 2,
      run: async () => {
        calls += 1
        throw new ApiRequestError("图像生成请求过于频繁", 429, 120)
      },
    },
  )

  assert.ok(calls <= 2)
  assert.ok(outcomes.some((item) => item.retryAfterSeconds === 120))
  assert.ok(outcomes.filter((item) => item.status === "canceled").length >= 2)
})

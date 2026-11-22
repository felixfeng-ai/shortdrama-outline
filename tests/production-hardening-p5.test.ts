import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import { getMiniMaxVideoConfig } from "../lib/video/model.ts"

test("P5-A MiniMax Base URL 可服务端覆写且默认仍为正式地址", () => {
  const original = getMiniMaxVideoConfig({
    VIDEO_GENERATION_ENABLED: "1",
    MINIMAX_API_KEY: "test-key",
  })
  const overridden = getMiniMaxVideoConfig({
    VIDEO_GENERATION_ENABLED: "1",
    MINIMAX_API_KEY: "test-key",
    MINIMAX_VIDEO_BASE_URL: "http://127.0.0.1:43210",
  })
  const service = fs.readFileSync("lib/video/service.ts", "utf8")
  const capabilities = fs.readFileSync("app/api/video/capabilities/route.ts", "utf8")

  assert.equal(original.baseUrl, "https://api.minimax.cn")
  assert.equal(overridden.baseUrl, "http://127.0.0.1:43210")
  assert.match(service, /config\.baseUrl/)
  assert.doesNotMatch(capabilities, /MINIMAX_VIDEO_BASE_URL/)
})

test("P5-B 示例首帧可作为内部视频生成的已采用参考", () => {
  const sample = fs.readFileSync("lib/sample-storyboard.ts", "utf8")

  assert.match(sample, /已采用定妆图/)
  assert.match(sample, /身份参考/)
})

test("P5-C 核心 E2E 使用本地 mock 完成内部视频生成与采用", () => {
  const script = fs.readFileSync("scripts/verify-core-production.mjs", "utf8")

  assert.match(script, /createServer/)
  assert.match(script, /v2\/video_generation/)
  assert.match(script, /v2\/query\/video_generation/)
  assert.match(script, /mock\.mp4/)
  assert.match(script, /MINIMAX_VIDEO_BASE_URL/)
  assert.match(script, /MINIMAX_API_KEY:\s*"mock-key"/)
  assert.match(script, /开始生成 1 镜/)
  assert.match(script, /采用并加入时间线/)
  assert.match(script, /internal-video-generated-desktop\.png/)
  assert.match(script, /internal-video-generated-mobile\.png/)
  assert.match(script, /lastSubmit/)
  assert.match(script, /duration/)
  assert.match(script, /resolution/)
})

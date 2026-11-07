import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

import {
  estimateVideoSelectionCost,
  resolveVideoSelection,
  supportsVideoDuration,
} from "../lib/video/catalog.ts"
import { getPublicVideoCapabilities } from "../lib/video/model.ts"

const capabilities = getPublicVideoCapabilities({
  VIDEO_GENERATION_ENABLED: "1",
  MINIMAX_API_KEY: "server-only",
  MINIMAX_VIDEO_MODEL: "MiniMax-H3-Lite",
  MINIMAX_VIDEO_RESOLUTION: "768P",
})

test("VM1 默认选择来自服务端能力，手动切换模型会选兼容分辨率", () => {
  assert.deepEqual(
    resolveVideoSelection(capabilities),
    { model: "MiniMax-H3-Lite", resolution: "768P" },
  )
  assert.deepEqual(
    resolveVideoSelection(capabilities, "MiniMax-H3", "2K"),
    { model: "MiniMax-H3", resolution: "2K" },
  )
  assert.deepEqual(
    resolveVideoSelection(capabilities, "MiniMax-H3-Max", "2K"),
    { model: "MiniMax-H3-Max", resolution: "768P" },
  )
})

test("VM2 价格和时长校验只使用视频能力事实", () => {
  assert.equal(
    estimateVideoSelectionCost(capabilities, "MiniMax-H3-Lite", "768P", 10),
    2_600_000,
  )
  assert.equal(supportsVideoDuration(capabilities, "MiniMax-H3-Max", 4), false)
  assert.equal(supportsVideoDuration(capabilities, "MiniMax-H3-Max", 5), true)
})

test("VM3 Web 视频能力接口存在且不暴露密钥", () => {
  const route = fs.readFileSync("app/api/video/capabilities/route.ts", "utf8")
  assert.match(route, /getPublicVideoCapabilities/)
  assert.doesNotMatch(route, /MINIMAX_API_KEY/)
})

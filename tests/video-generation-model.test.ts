import { test } from "node:test"
import assert from "node:assert/strict"

import {
  buildMiniMaxVideoRequest,
  estimateVideoCostMicros,
  getMiniMaxVideoConfig,
  getPublicVideoCapabilities,
  parseMiniMaxVideoSubmission,
  parseMiniMaxVideoTask,
} from "../lib/video/model.ts"

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01])

test("P0-V1 只从服务端环境读取视频供应商配置", () => {
  const config = getMiniMaxVideoConfig({
    VIDEO_GENERATION_ENABLED: "1",
    MINIMAX_API_KEY: "server-video-key",
    MINIMAX_VIDEO_MODEL: "MiniMax-H3-Lite",
    MINIMAX_VIDEO_RESOLUTION: "768P",
  })

  assert.equal(config.apiKey, "server-video-key")
  assert.equal(config.model, "MiniMax-H3-Lite")
  assert.equal(config.defaultResolution, "768P")
  assert.throws(
    () => getMiniMaxVideoConfig({ VIDEO_GENERATION_ENABLED: "0", MINIMAX_API_KEY: "key" }),
    /视频生成尚未启用/,
  )
  assert.throws(
    () => getMiniMaxVideoConfig({ VIDEO_GENERATION_ENABLED: "1" }),
    /平台视频服务未配置/,
  )
})

test("P0-V1 按模型、分辨率和时长估算人民币成本", () => {
  assert.equal(
    estimateVideoCostMicros({ model: "MiniMax-H3-Lite", resolution: "768P", duration: 10 }),
    2_600_000,
  )
  assert.equal(
    estimateVideoCostMicros({ model: "MiniMax-H3", resolution: "2K", duration: 5 }),
    4_000_000,
  )
  assert.throws(
    () => estimateVideoCostMicros({ model: "MiniMax-H3-Lite", resolution: "2K", duration: 5 }),
    /不支持 2K/,
  )
  assert.throws(
    () => estimateVideoCostMicros({ model: "MiniMax-H3-Lite", resolution: "768P", duration: 3 }),
    /时长必须在 4-15 秒/,
  )
})

test("App 视频能力只暴露可用模型和价格，不泄露服务端密钥", () => {
  const enabled = getPublicVideoCapabilities({
    VIDEO_GENERATION_ENABLED: "1",
    MINIMAX_API_KEY: "server-secret-key",
    MINIMAX_VIDEO_MODEL: "MiniMax-H3-Lite",
    MINIMAX_VIDEO_RESOLUTION: "768P",
  })
  assert.equal(enabled.enabled, true)
  assert.equal(enabled.defaultModel, "MiniMax-H3-Lite")
  assert.equal(enabled.defaultResolution, "768P")
  assert.equal(
    enabled.models.find((model) => model.id === "MiniMax-H3-Lite")?.pricesPerSecond["768P"],
    0.26,
  )
  assert.equal(JSON.stringify(enabled).includes("server-secret-key"), false)

  const disabled = getPublicVideoCapabilities({
    VIDEO_GENERATION_ENABLED: "0",
    MINIMAX_API_KEY: "server-secret-key",
  })
  assert.equal(disabled.enabled, false)
})

test("P0-V2 图生视频请求使用首帧 data URI，不泄露服务端路径", () => {
  const request = buildMiniMaxVideoRequest({
    prompt: "She turns and walks toward the window.",
    model: "MiniMax-H3-Lite",
    resolution: "768P",
    duration: 5,
    ratio: "9:16",
    firstFrame: { bytes: PNG, mime: "image/png" },
  })

  assert.equal(request.url, "https://api.minimax.cn/v2/video_generation")
  assert.equal(request.body.model, "MiniMax-H3-Lite")
  assert.equal(request.body.resolution, "768P")
  assert.equal(request.body.duration, 5)
  assert.equal(request.body.ratio, "adaptive")
  const content = request.body.content as Array<Record<string, unknown>>
  assert.equal(content[0].type, "text")
  assert.equal(content[1].type, "image_url")
  assert.equal(content[1].role, "first_frame")
  const imageUrl = content[1].image_url as Record<string, unknown>
  assert.match(String(imageUrl.url), /^data:image\/png;base64,/)
  assert.equal(JSON.stringify(request.body).includes("generated/"), false)
})

test("P0-V2 文生视频保留明确画幅，空提示词被拒绝", () => {
  const request = buildMiniMaxVideoRequest({
    prompt: "A rain-soaked alley at night.",
    model: "MiniMax-H3",
    resolution: "2K",
    duration: 10,
    ratio: "16:9",
  })
  assert.equal(request.body.ratio, "16:9")
  const content = request.body.content as Array<Record<string, unknown>>
  assert.equal(content.length, 1)
  assert.throws(
    () => buildMiniMaxVideoRequest({
      prompt: " ",
      model: "MiniMax-H3",
      resolution: "2K",
      duration: 5,
      ratio: "16:9",
    }),
    /缺少视频提示词/,
  )
})

test("P0-V3 提交和轮询结果归一化", () => {
  assert.equal(
    parseMiniMaxVideoSubmission({ task_id: "provider-task-1" }),
    "provider-task-1",
  )
  assert.deepEqual(
    parseMiniMaxVideoTask({ task: { status: "queued" } }),
    { status: "queued" },
  )
  assert.deepEqual(
    parseMiniMaxVideoTask({
      task: {
        status: "succeeded",
        content: { url: "https://cdn.example.com/video.mp4" },
        usage: { output_seconds: 5 },
        duration: 5,
        resolution: "768P",
        ratio: "9:16",
      },
    }),
    {
      status: "succeeded",
      videoUrl: "https://cdn.example.com/video.mp4",
      durationSeconds: 5,
      resolution: "768P",
      ratio: "9:16",
      usage: { output_seconds: 5 },
    },
  )
  assert.deepEqual(
    parseMiniMaxVideoTask({
      task: {
        status: "failed",
        error: { code: "1026", message: "video description contains sensitive content" },
      },
    }),
    {
      status: "failed",
      error: "video description contains sensitive content",
      errorCode: "1026",
    },
  )
})

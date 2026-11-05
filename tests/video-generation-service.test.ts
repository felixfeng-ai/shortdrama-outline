import { test } from "node:test"
import assert from "node:assert/strict"

import {
  VideoProviderError,
  cancelMiniMaxVideo,
  downloadMiniMaxVideo,
  queryMiniMaxVideo,
  submitMiniMaxVideo,
} from "../lib/video/service.ts"

const ENV = {
  VIDEO_GENERATION_ENABLED: "1",
  MINIMAX_API_KEY: "server-test-key",
  MINIMAX_VIDEO_MODEL: "MiniMax-H3-Lite",
  MINIMAX_VIDEO_RESOLUTION: "768P",
}

const INPUT = {
  prompt: "A rain-soaked rooftop.",
  model: "MiniMax-H3-Lite",
  resolution: "768P",
  duration: 5,
  ratio: "9:16",
}

const VALID_MP4 = Uint8Array.from([
  0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70,
  0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x02, 0x00,
])

test("P0-V2 视频提交错误按鉴权、余额、审核、限流和 5xx 分层", async () => {
  const cases = [
    { status: 401, expectedStatus: 503, message: /密钥无效/ },
    { status: 402, expectedStatus: 503, message: /余额不足/ },
    { status: 422, expectedStatus: 422, message: /供应商审核/ },
    { status: 503, expectedStatus: 502, message: /服务请求失败/ },
  ]

  for (const item of cases) {
    await assert.rejects(
      submitMiniMaxVideo(
        INPUT,
        async () => Response.json(
          { error: { message: "provider detail" } },
          { status: item.status },
        ),
        ENV,
      ),
      (error) => {
        assert.ok(error instanceof VideoProviderError)
        assert.equal(error.status, item.expectedStatus)
        assert.match(error.message, item.message)
        return true
      },
    )
  }

  await assert.rejects(
    submitMiniMaxVideo(
      INPUT,
      async () => new Response("{}", {
        status: 429,
        headers: { "retry-after": "9" },
      }),
      ENV,
    ),
    (error) => {
      assert.ok(error instanceof VideoProviderError)
      assert.equal(error.status, 503)
      assert.equal(error.retryAfterSeconds, 9)
      return true
    },
  )
})

test("P0-V2 视频网络中断不伪装成用户参数错误", async () => {
  await assert.rejects(
    submitMiniMaxVideo(
      INPUT,
      async () => { throw new TypeError("fetch failed") },
      ENV,
    ),
    (error) => {
      assert.ok(error instanceof VideoProviderError)
      assert.equal(error.status, 503)
      assert.match(error.message, /连接失败/)
      return true
    },
  )
})

test("P0-V2 查询、下载和取消统一使用供应商契约", async () => {
  const submitted = await submitMiniMaxVideo(
    INPUT,
    async () => Response.json({ task_id: "provider-task-service" }),
    ENV,
  )
  assert.equal(submitted.providerTaskId, "provider-task-service")

  const state = await queryMiniMaxVideo(
    submitted.providerTaskId,
    async () => Response.json({ task: { status: "running" } }),
    ENV,
  )
  assert.deepEqual(state, { status: "running" })

  const downloaded = await downloadMiniMaxVideo(
    "https://cdn.example.com/video.mp4",
    async () => new Response(VALID_MP4, {
      status: 200,
      headers: {
        "content-type": "video/mp4",
        "content-length": String(VALID_MP4.length),
      },
    }),
  )
  assert.equal(downloaded.mime, "video/mp4")
  assert.equal(downloaded.bytes.length, VALID_MP4.length)

  assert.equal(await cancelMiniMaxVideo(
    "provider-task-service",
    async () => new Response("{}", { status: 400 }),
    ENV,
  ), false)
  assert.equal(await cancelMiniMaxVideo(
    "provider-task-service",
    async () => Response.json({ ok: true }),
    ENV,
  ), true)
})

test("P0-V2 下载拒绝错误响应、伪装 MP4 和超大文件", async () => {
  await assert.rejects(
    downloadMiniMaxVideo(
      "https://cdn.example.com/missing.mp4",
      async () => new Response("missing", { status: 404 }),
    ),
    /下载失败/,
  )
  await assert.rejects(
    downloadMiniMaxVideo(
      "https://cdn.example.com/fake.mp4",
      async () => new Response(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]), {
        status: 200,
      }),
    ),
    /不是有效 MP4/,
  )
  await assert.rejects(
    downloadMiniMaxVideo(
      "https://cdn.example.com/large.mp4",
      async () => new Response(VALID_MP4, {
        status: 200,
        headers: { "content-length": String(201 * 1024 * 1024) },
      }),
    ),
    /超过 200MB/,
  )
})

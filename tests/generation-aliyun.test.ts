import { test } from "node:test"
import assert from "node:assert/strict"

import {
  buildAliyunImageRequest,
  getAliyunImageConfig,
  parseAliyunTaskResult,
  parseAliyunTaskSubmission,
  publicGenerationError,
} from "../lib/generation/model.ts"
import { runImageGeneration } from "../lib/generation/service.ts"
import { buildCharacterKeyframePrompt } from "../lib/generation/prompt.ts"

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01])

test("G1.1 平台只从服务端环境读取通义万相配置", () => {
  const config = getAliyunImageConfig({
    ALIYUN_DASHSCOPE_API_KEY: "server-secret",
    ALIYUN_IMAGE_MODEL: "wanx2.1-t2i-turbo",
    ALIYUN_IMAGE_EDIT_MODEL: "qwen-image-2.0-pro",
  })
  assert.equal(config.apiKey, "server-secret")
  assert.equal(config.model, "wanx2.1-t2i-turbo")
  assert.equal(config.editModel, "qwen-image-2.0-pro")
  assert.throws(() => getAliyunImageConfig({}), /平台图像服务未配置/)
})

test("G1.1 通义请求使用异步任务接口和正确的三档画幅", () => {
  const portrait = buildAliyunImageRequest({
    prompt: "cinematic portrait",
    model: "wanx2.1-t2i-turbo",
    aspect: "portrait",
  })
  assert.equal(portrait.url, "https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis")
  assert.equal(portrait.body.model, "wanx2.1-t2i-turbo")
  assert.deepEqual(portrait.body.input, { prompt: "cinematic portrait" })
  assert.equal((portrait.body.parameters as Record<string, unknown>).size, "720*1280")

  const landscape = buildAliyunImageRequest({
    prompt: "wide shot",
    model: "wanx2.1-t2i-turbo",
    aspect: "landscape",
  })
  assert.equal((landscape.body.parameters as Record<string, unknown>).size, "1280*720")
})

test("G1.2 提交结果读取 task_id，轮询结果区分状态与图片地址", () => {
  assert.equal(parseAliyunTaskSubmission({ output: { task_id: "task-1" } }), "task-1")
  assert.deepEqual(
    parseAliyunTaskResult({ output: { task_status: "RUNNING" } }),
    { status: "RUNNING" },
  )
  assert.deepEqual(
    parseAliyunTaskResult({
      output: {
        task_status: "SUCCEEDED",
        results: [{ url: "https://cdn.example.com/result.png" }],
      },
    }),
    { status: "SUCCEEDED", imageUrl: "https://cdn.example.com/result.png" },
  )
  assert.deepEqual(
    parseAliyunTaskResult({ output: { task_status: "FAILED", message: "审核失败" } }),
    { status: "FAILED", error: "审核失败" },
  )
})

test("G1.2 runImageGeneration 完成提交、轮询、下载并校验图片", async () => {
  const calls: string[] = []
  const fakeFetch = async (input: string | URL | Request) => {
    const url = String(input)
    calls.push(url)
    if (url.endsWith("/image-synthesis")) {
      return Response.json({ output: { task_id: "task-1", task_status: "PENDING" } })
    }
    if (url.endsWith("/api/v1/tasks/task-1")) {
      return Response.json({
        output: {
          task_status: "SUCCEEDED",
          results: [{ url: "https://cdn.example.com/result.png" }],
        },
      })
    }
    return new Response(PNG, { status: 200, headers: { "content-type": "image/png" } })
  }

  const result = await runImageGeneration({
    prompt: "character keyframe",
    aspect: "portrait",
  }, fakeFetch as typeof fetch, {
    ALIYUN_DASHSCOPE_API_KEY: "server-secret",
    ALIYUN_IMAGE_MODEL: "wanx2.1-t2i-turbo",
  }, async () => {})

  assert.equal(result.mime, "image/png")
  assert.deepEqual(result.bytes, PNG)
  assert.equal(calls.length, 3)
})

test("G1.3 平台密钥失效时不把英文 Key 错误暴露给编剧", async () => {
  const fakeFetch = async () => Response.json(
    { code: "InvalidApiKey", message: "Invalid API-key provided." },
    { status: 401 },
  )
  await assert.rejects(
    () => runImageGeneration({ prompt: "portrait", aspect: "portrait" }, fakeFetch as typeof fetch, {
      ALIYUN_DASHSCOPE_API_KEY: "invalid-server-key",
      ALIYUN_IMAGE_MODEL: "wanx2.1-t2i-turbo",
    }, async () => {}),
    /平台图像服务密钥无效，请联系管理员/,
  )
})

test("G1.3 历史失败任务里的 Key 错误也必须脱敏", () => {
  assert.equal(
    publicGenerationError("通义万相请求失败：Invalid API-key provided."),
    "平台图像服务密钥无效，请联系管理员",
  )
  assert.equal(
    publicGenerationError("通义万相生成超时，请稍后重试"),
    "通义万相生成超时，请稍后重试",
  )
})

test("G4 老项目没有 imagePrompts 时仍能从角色锚点生成提示词", () => {
  const prompt = buildCharacterKeyframePrompt({
    name: "林远",
    anchor: "age: 32; face: narrow eyes; wardrobe: sand jacket",
    age: "32",
    face: "narrow eyes",
    hair: "",
    marks: "",
    wardrobe: "sand jacket",
    props: "",
  })
  assert.match(prompt, /narrow eyes/)
  assert.match(prompt, /no text/i)
})

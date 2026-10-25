import { test } from "node:test"
import assert from "node:assert/strict"

import { buildAliyunImageEditRequest } from "../lib/generation/model.ts"
import {
  selectGenerationReferenceCandidates,
  withGenerationReferenceInstructions,
} from "../lib/generation/references.ts"
import { runImageGeneration } from "../lib/generation/service.ts"
import type { GeneratedAsset } from "../lib/generation/types.ts"

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01])

function asset(
  id: string,
  targetId: string,
  selected = true,
  createdAt = 1,
): GeneratedAsset {
  return {
    id,
    taskId: `task-${id}`,
    projectId: "project-1",
    targetType: "character",
    targetId,
    storageKey: `generated/project-1/${id}.png`,
    mime: "image/png",
    bytes: PNG.length,
    providerId: "aliyun",
    model: "wanx2.1-t2i-turbo",
    prompt: "portrait",
    selectedAt: selected ? createdAt : null,
    createdAt,
    downloadUrl: `/api/generated-assets/${id}`,
  }
}

test("参考图：镜头按出场角色带入已采用关键帧，跳过未采用并限制三张", () => {
  const candidates = selectGenerationReferenceCandidates({
    targetType: "shot",
    targetId: "shot-e-1",
    shots: [{
      id: "shot-1",
      entityId: "shot-e-1",
      characters: ["林远", "苏婉", "店主", "路人"],
    }],
    visualCharacters: [
      { name: "林远", entityId: "char-linyuan" },
      { name: "苏婉", entityId: "char-suwan" },
      { name: "店主", entityId: "char-shop" },
      { name: "路人", entityId: "char-extra" },
    ],
    assets: [
      asset("asset-lin", "char-linyuan", true, 1),
      asset("asset-su", "char-suwan", true, 2),
      asset("asset-shop", "char-shop", false, 3),
      asset("asset-extra", "char-extra", true, 4),
    ],
  })

  assert.deepEqual(candidates.map((item) => item.asset.id), ["asset-lin", "asset-su", "asset-extra"])
  assert.deepEqual(candidates.map((item) => item.role), ["identity", "identity", "identity"])
  assert.deepEqual(candidates.map((item) => item.label), ["林远", "苏婉", "路人"])
})

test("参考图：角色重生成先用自己的身份图，其他角色只作风格参考", () => {
  const candidates = selectGenerationReferenceCandidates({
    targetType: "character",
    targetId: "char-suwan",
    shots: [],
    visualCharacters: [
      { name: "林远", entityId: "char-linyuan" },
      { name: "苏婉", entityId: "char-suwan" },
      { name: "店主", entityId: "char-shop" },
      { name: "路人", entityId: "char-extra" },
    ],
    assets: [
      asset("asset-lin", "char-linyuan", true, 1),
      asset("asset-su-v2", "char-suwan", true, 4),
      asset("asset-shop", "char-shop", true, 3),
      asset("asset-extra", "char-extra", true, 2),
      asset("asset-readable", "char-linyuan", false, 5),
    ],
  })

  assert.deepEqual(candidates.map((item) => item.asset.id), [
    "asset-su-v2",
    "asset-shop",
    "asset-extra",
  ])
  assert.deepEqual(candidates.map((item) => item.role), ["identity", "style", "style"])
})

test("参考图：新角色没有自身图时，其他角色最多两张且全部只作风格参考", () => {
  const candidates = selectGenerationReferenceCandidates({
    targetType: "character",
    targetId: "char-new",
    shots: [],
    visualCharacters: [
      { name: "林远", entityId: "char-linyuan" },
      { name: "苏婉", entityId: "char-suwan" },
      { name: "店主", entityId: "char-shop" },
    ],
    assets: [
      asset("asset-lin", "char-linyuan", true, 1),
      asset("asset-su", "char-suwan", true, 2),
      asset("asset-shop", "char-shop", true, 3),
    ],
  })

  assert.deepEqual(candidates.map((item) => item.asset.id), ["asset-shop", "asset-su"])
  assert.deepEqual(candidates.map((item) => item.role), ["style", "style"])
})

test("通义多图编辑请求使用同步多模态接口，并携带 1-3 张数据地址", () => {
  const request = buildAliyunImageEditRequest({
    prompt: "林远站在炉门前",
    model: "qwen-image-2.0-pro",
    aspect: "portrait",
    images: [
      { bytes: PNG, mime: "image/png" },
      { bytes: PNG, mime: "image/jpeg" },
    ],
  })

  assert.equal(
    request.url,
    "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation",
  )
  assert.equal(request.body.model, "qwen-image-2.0-pro")
  const input = request.body.input as { messages: Array<{ content: Array<Record<string, string>> }> }
  const content = input.messages[0].content
  assert.match(content[0].image, /^data:image\/png;base64,/)
  assert.match(content[1].image, /^data:image\/jpeg;base64,/)
  assert.equal(content[2].text, "林远站在炉门前")
  assert.equal((request.body.parameters as Record<string, unknown>).size, "720*1280")
})

test("通义多图编辑拒绝超过三张参考图", () => {
  assert.throws(
    () => buildAliyunImageEditRequest({
      prompt: "portrait",
      model: "qwen-image-2.0-pro",
      images: Array.from({ length: 4 }, () => ({ bytes: PNG, mime: "image/png" })),
    }),
    /最多.*3|不能超过.*3/,
  )
})

test("通义多图编辑走同步请求，解析图片地址并下载结果", async () => {
  const calls: string[] = []
  let requestBody: Record<string, unknown> | null = null
  const fakeFetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    calls.push(url)
    if (url.endsWith("/multimodal-generation/generation")) {
      requestBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>
      return Response.json({
        output: {
          choices: [{
            finish_reason: "stop",
            message: { content: [{ image: "https://cdn.example.com/edit.png" }] },
          }],
        },
      })
    }
    return new Response(PNG, { status: 200, headers: { "content-type": "image/png" } })
  }

  const result = await runImageGeneration({
    prompt: "identity reference scene",
    aspect: "portrait",
    referenceImages: [{ bytes: PNG, mime: "image/png" }],
  }, fakeFetch as typeof fetch, {
    ALIYUN_DASHSCOPE_API_KEY: "server-secret",
    ALIYUN_IMAGE_MODEL: "wanx2.1-t2i-turbo",
    ALIYUN_IMAGE_EDIT_MODEL: "qwen-image-2.0-pro",
  }, async () => {})

  assert.equal(result.mime, "image/png")
  assert.deepEqual(result.bytes, PNG)
  assert.equal(calls.length, 2)
  assert.equal(calls[0], "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation")
  const sent = requestBody as unknown as Record<string, unknown>
  assert.equal(sent.model, "qwen-image-2.0-pro")
})

test("任务重试重复传入已拼好的提示词时，不重复追加参考图说明", () => {
  const candidate = {
    asset: asset("asset-retry", "char-retry"),
    label: "林远",
    role: "identity" as const,
  }
  const once = withGenerationReferenceInstructions("first frame", [candidate])
  const twice = withGenerationReferenceInstructions(once, [candidate])
  assert.equal(twice, once)
  assert.equal((twice.match(/PROJECT KEYFRAME REFERENCES/g) ?? []).length, 1)
})

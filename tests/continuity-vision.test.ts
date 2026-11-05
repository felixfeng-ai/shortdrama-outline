import assert from "node:assert/strict"
import test from "node:test"

import {
  buildContinuityPrompt,
  compareContinuityPhoto,
  parseContinuityReport,
} from "../lib/continuity/vision.ts"
import { buildContinuityContext } from "../lib/continuity/context.ts"

const context = {
  projectTitle: "雨夜快递",
  shotLabel: "第 3 集 · 第 3 镜 · 旧楼门口",
  shotPrompt: "close shot, OLD APARTMENT GATEWAY, cold white light",
  characters: [{
    name: "陈默",
    wardrobe: "洗旧的深蓝快递外套",
    marks: "左眉尾浅疤",
    anchor: "CHEN MO: worn navy delivery jacket",
  }],
  places: [{
    name: "旧楼门口",
    space: "狭窄门廊",
    props: "门缝里的旧车票",
    lighting: "冷白感应灯",
    anchor: "OLD APARTMENT GATEWAY: narrow doorway",
  }],
  canon: ["陈默右手没有戴表", "门牌为 302"],
}

test("现场连续性 Prompt 包含指定镜头、人物、地点和 Canon", () => {
  const prompt = buildContinuityPrompt(context)
  assert.match(prompt, /第 3 集 · 第 3 镜/)
  assert.match(prompt, /陈默/)
  assert.match(prompt, /洗旧的深蓝快递外套/)
  assert.match(prompt, /门缝里的旧车票/)
  assert.match(prompt, /门牌为 302/)
  assert.match(prompt, /人物造型/)
  assert.match(prompt, /地点结构/)
  assert.match(prompt, /道具/)
  assert.match(prompt, /提示词修正/)
})

test("视觉模型只收到 data URL，结果被清洗成可执行偏差", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init })
    return Response.json({
      choices: [{
        message: {
          content: JSON.stringify({
            summary: "人物造型基本一致，门口亮度偏高。",
            issues: [
              {
                area: "lighting",
                severity: "warning",
                expected: "冷白感应灯",
                observed: "暖黄色顶灯",
                evidence: "照片顶部光源偏暖",
                suggestion: "把现场灯改成冷白。",
                promptPatch: "cold white sensor light",
              },
              {
                area: "unknown",
                severity: "critical",
                expected: "",
                observed: "",
                evidence: "",
                suggestion: "",
                promptPatch: "",
              },
            ],
          }),
        },
      }],
    })
  }) as typeof fetch

  const report = await compareContinuityPhoto({
    imageBase64: "iVBORw0KGgo=",
    mime: "image/png",
    context,
  }, fetchImpl, {
    DASHSCOPE_API_KEY: "vision-key",
    ALIYUN_VISION_MODEL: "qwen-vl-max",
  })

  assert.equal(calls.length, 1)
  assert.match(calls[0].url, /compatible-mode\/v1\/chat\/completions/)
  assert.equal(new Headers(calls[0].init?.headers).get("Authorization"), "Bearer vision-key")
  const body = JSON.parse(String(calls[0].init?.body))
  assert.equal(body.model, "qwen-vl-max")
  assert.match(JSON.stringify(body), /data:image\/png;base64,iVBORw0KGgo=/)
  assert.match(JSON.stringify(body), /门牌为 302/)
  assert.equal(report.summary, "人物造型基本一致，门口亮度偏高。")
  assert.equal(report.issues.length, 1)
  assert.equal(report.issues[0].area, "lighting")
  assert.equal(report.issues[0].promptPatch, "cold white sensor light")
})

test("没有偏差时如实返回零问题，结果损坏时拒绝伪造成功", () => {
  assert.deepEqual(
    parseContinuityReport({ summary: "人物、地点、道具和光线都符合 Canon", issues: [] }),
    { summary: "人物、地点、道具和光线都符合 Canon", issues: [] },
  )
  assert.throws(() => parseContinuityReport({ issues: [] }), /没有返回检查摘要/)
})

test("现场检查只带出当前镜头相关人物、地点和 Canon", () => {
  const result = buildContinuityContext({
    projectTitle: "雨夜快递",
    targetId: "shot-a",
    snapshots: {
      visualCharacters: [{
        name: "陈默",
        wardrobe: "深蓝快递服",
        marks: "左眉浅疤",
        anchor: "CHEN MO",
      }, {
        name: "苏婉",
        wardrobe: "灰色开衫",
        marks: "",
        anchor: "SU WAN",
      }],
      visualPlaces: [{
        name: "旧楼门口",
        space: "窄门廊",
        props: "旧车票",
        lighting: "冷白灯",
        anchor: "OLD GATEWAY",
      }, {
        name: "城郊别墅",
        space: "铁门",
        props: "伞",
        lighting: "夜雨",
        anchor: "VILLA",
      }],
      shots: [{
        entityId: "shot-a",
        episode: 3,
        shot: 3,
        scene: "旧楼门口",
        place: "旧楼门口",
        characters: ["陈默"],
        prompt: "close shot",
      }],
    },
    canon: [
      { entityName: "陈默", field: "hand", value: "右手没有戴表" },
      { entityName: "苏婉", field: "ring", value: "左手戴玉戒" },
    ],
  })

  assert.match(result.shotLabel, /第 3 集 · 第 3 镜/)
  assert.deepEqual(result.characters.map((item) => item.name), ["陈默"])
  assert.deepEqual(result.places.map((item) => item.name), ["旧楼门口"])
  assert.deepEqual(result.canon, ["陈默｜hand：右手没有戴表"])
})

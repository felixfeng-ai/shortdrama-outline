import assert from "node:assert/strict"
import test from "node:test"

import { POST as postContinuity } from "../app/api/mobile/continuity/route.ts"
import { createProject, createSnapshot } from "../lib/assets/repo.ts"
import { __resetDbForTests, getDbForRequest } from "../lib/assets/store.ts"

const OWNER = `anon_${"c".repeat(48)}`

test("App 现场连续性接口读取当前项目快照并返回视觉偏差", async () => {
  __resetDbForTests(":memory:")
  const db = getDbForRequest()
  const project = createProject(db, "雨夜快递", OWNER)
  createSnapshot(db, {
    projectId: project.id,
    kind: "visualCharacters",
    payload: [{
      name: "陈默",
      wardrobe: "深蓝快递服",
      marks: "左眉浅疤",
      anchor: "CHEN MO",
    }],
  })
  createSnapshot(db, {
    projectId: project.id,
    kind: "visualPlaces",
    payload: [{
      name: "旧楼门口",
      space: "窄门廊",
      props: "旧车票",
      lighting: "冷白灯",
      anchor: "OLD GATEWAY",
    }],
  })
  createSnapshot(db, {
    projectId: project.id,
    kind: "shots",
    payload: [{
      entityId: "shot-a",
      episode: 3,
      shot: 3,
      scene: "旧楼门口",
      place: "旧楼门口",
      characters: ["陈默"],
      prompt: "close shot",
    }],
  })

  const originalFetch = globalThis.fetch
  const originalKey = process.env.DASHSCOPE_API_KEY
  process.env.DASHSCOPE_API_KEY = "vision-test-key"
  globalThis.fetch = (async () => Response.json({
    choices: [{
      message: {
        content: JSON.stringify({
          summary: "人物符合，门口光线偏暖。",
          issues: [{
            area: "lighting",
            severity: "warning",
            expected: "冷白灯",
            observed: "暖黄灯",
            evidence: "门廊顶部",
            suggestion: "换回冷白灯",
            promptPatch: "cold white light",
          }],
        }),
      },
    }],
  })) as typeof fetch

  try {
    const response = await postContinuity(new Request(
      "http://localhost/api/mobile/continuity",
      {
        method: "POST",
        headers: {
          cookie: `chengju_sid=${OWNER}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          projectId: project.id,
          targetId: "shot-a",
          imageBase64: "iVBORw0KGgo=",
          mime: "image/png",
        }),
      },
    ))
    const payload = await response.json()
    assert.equal(response.status, 200)
    assert.equal(payload.data.report.issues[0].area, "lighting")
    assert.match(payload.data.report.summary, /光线偏暖/)
    assert.equal(payload.data.context.characterCount, 1)
    assert.equal(payload.data.context.placeCount, 1)
  } finally {
    globalThis.fetch = originalFetch
    if (originalKey === undefined) delete process.env.DASHSCOPE_API_KEY
    else process.env.DASHSCOPE_API_KEY = originalKey
  }
})

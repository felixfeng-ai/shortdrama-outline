import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

import { POST as postGenerations } from "../app/api/generations/route.ts"
import { __resetDbForTests, getDbForRequest } from "../lib/assets/store.ts"
import { createProject, createSnapshot } from "../lib/assets/repo.ts"
import { buildPlaceImagePrompt, placeGenerationTargetId } from "../lib/assets/anchors.ts"

const OWNER = `anon_${"p".repeat(48)}`
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x02])

test("PG-R1.1 地点面板显示已建立数量与缺失数量，而不是自相矛盾的总数", () => {
  const panel = fs.readFileSync("components/PlacePanel.tsx", "utf8")
  assert.ok(panel.includes("已建立 {places.length} 个地点"), "标题应区分已建立地点")
  assert.ok(panel.includes("缺少 {missing.length} 个"), "预警应明确显示缺失数量")
})

test("PG-R1.2-R1.3 缺失地点可就地补建，并编译后写回地点清单", () => {
  const panel = fs.readFileSync("components/PlacePanel.tsx", "utf8")
  assert.ok(panel.includes("补建锚点"), "缺少地点应有补建入口")
  assert.ok(panel.includes("draftName"), "补建表单应预填地点名")
  assert.ok(panel.includes("compilePlaceAnchor"), "保存时应编译稳定锚点")
  assert.match(panel, /const next = \[\s*\.\.\.places,\s*place\]/, "保存后应追加到地点清单")
  assert.ok(panel.includes("onChange(next)"), "非持久化场景下也应写回地点状态")
})

test("PG-R1.4 四个视觉字段都为空时不能保存空锚点", () => {
  const panel = fs.readFileSync("components/PlacePanel.tsx", "utf8")
  assert.ok(panel.includes("draftAnchor"), "补建表单应实时显示锚点")
  assert.ok(panel.includes("disabled={!draftAnchor"), "空锚点保存按钮必须禁用")
})

test("PG-R1.5 补建地点先落入 visualPlaces 快照，再允许生成场景图", () => {
  const panel = fs.readFileSync("components/PlacePanel.tsx", "utf8")
  const page = fs.readFileSync("app/page.tsx", "utf8")
  assert.ok(panel.includes("onAddPlace"), "地点面板应把新增动作交给页面持久化")
  assert.ok(page.includes("onAddPlace="), "页面没有接入地点新增持久化")
  assert.ok(page.includes("saveSnapshot(pid, 'visualPlaces', next)"), "新增地点没有保存快照")
})

test("PG-R2.0 地点生成目标 id 必须由地点名稳定派生", async () => {
  const anchors = await import("../lib/assets/anchors.ts")
  const derive = (anchors as Record<string, unknown>).placeGenerationTargetId
  assert.equal(typeof derive, "function", "缺少地点生成目标 id 派生函数")
  const fn = derive as (name: string) => string
  assert.equal(fn("外门弟子通铺外"), fn("外门弟子通铺外"))
  assert.notEqual(fn("外门弟子通铺外"), fn("外门弟子通铺内"))
  assert.match(fn("外门弟子通铺外"), /^place-[a-z0-9]+$/)
})

test("PG-R2.1-R2.2 地点卡复用关键帧面板生成空场景图", () => {
  const panel = fs.readFileSync("components/PlacePanel.tsx", "utf8")
  assert.ok(panel.includes("<KeyframePanel"), "地点卡应复用关键帧面板")
  assert.ok(panel.includes('targetType="place"'), "地点生成目标必须是 place")
  assert.ok(panel.includes('aspect="landscape"'), "场景图应使用 16:9 横图")
  assert.ok(panel.includes("buildPlaceImagePrompt"), "提示词应由地点锚点派生")
  assert.ok(panel.includes("生成场景图"), "缺少场景图生成操作")
})

test("PG-R2.1 地点生成器使用场景图文案，不把场景图叫成镜头关键帧", () => {
  const keyframe = fs.readFileSync("components/KeyframePanel.tsx", "utf8")
  assert.ok(keyframe.includes("云端场景图"), "地点生成器缺少场景图标题")
  assert.ok(keyframe.includes("已采用场景图作一致性参考"), "地点参考说明不明确")
  assert.ok(keyframe.includes("下载场景图"), "地点结果下载文案仍叫关键帧")
  assert.ok(keyframe.includes("还没有场景图"), "地点空态仍叫关键帧")
})

test("PG-R2.3 生成 API 接受地点目标并保存为 place 任务", async () => {
  __resetDbForTests(":memory:")
  const db = getDbForRequest()
  const project = createProject(db, "地点生成", OWNER)
  const place = {
    id: "place-row-1",
    name: "外门弟子通铺外",
    space: "长条通铺与木栅栏",
    props: "旧木箱、铜盆",
    lighting: "清晨冷光",
    grade: "灰绿色",
    anchor: "space: 长条通铺与木栅栏, lighting: 清晨冷光",
  }
  createSnapshot(db, {
    projectId: project.id,
    kind: "visualPlaces",
    payload: [place],
  })

  const originalFetch = globalThis.fetch
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input)
    if (url.endsWith("/image-synthesis")) {
      return Response.json({ output: { task_id: "place-task", task_status: "PENDING" } })
    }
    if (url.endsWith("/api/v1/tasks/place-task")) {
      return Response.json({
        output: {
          task_status: "SUCCEEDED",
          results: [{ url: "https://cdn.example.com/place.png" }],
        },
      })
    }
    return new Response(PNG, { status: 200, headers: { "content-type": "image/png" } })
  }) as typeof fetch
  process.env.ALIYUN_DASHSCOPE_API_KEY = "server-test-key"
  process.env.ALIYUN_IMAGE_MODEL = "wanx2.1-t2i-turbo"

  try {
    const res = await postGenerations(new Request("http://localhost/api/generations", {
      method: "POST",
      headers: new Headers({
        cookie: `chengju_sid=${OWNER}`,
        "content-type": "application/json",
      }),
      body: JSON.stringify({
        projectId: project.id,
        targetType: "place",
        targetId: placeGenerationTargetId(place.name),
        prompt: buildPlaceImagePrompt(place),
        aspect: "landscape",
        look: { palette: "灰绿色", light: "清晨冷光", lens: "广角", banned: "人物" },
      }),
    }))
    const payload = await res.json()
    assert.equal(res.status, 200, payload.error)
    assert.equal(payload.data.task.targetType, "place")
    assert.equal(payload.data.asset.targetType, "place")
    assert.match(payload.data.task.prompt, /no people/)
    assert.match(payload.data.task.prompt, /灰绿色/)
  } finally {
    globalThis.fetch = originalFetch
    delete process.env.ALIYUN_DASHSCOPE_API_KEY
    delete process.env.ALIYUN_IMAGE_MODEL
  }
})

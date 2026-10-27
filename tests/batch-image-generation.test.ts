import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

import { POST as postGenerations } from "../app/api/generations/route.ts"
import { createProject, createSnapshot } from "../lib/assets/repo.ts"
import { __resetDbForTests, getDbForRequest } from "../lib/assets/store.ts"
import {
  createGenerationTask,
  listGeneratedAssets,
  saveGeneratedAsset,
  selectGeneratedAsset,
} from "../lib/generation/repo.ts"
import { writeGeneratedImage } from "../lib/generation/files.ts"
import {
  eligibleBatchTargets,
  estimateBatchDuration,
  runBatchGeneration,
  type BatchGenerationTarget,
} from "../lib/generation/batch.ts"
import type { GeneratedAsset } from "../lib/generation/types.ts"

const OWNER = `anon_${"m".repeat(48)}`
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x02])

function target(patch: Partial<BatchGenerationTarget> = {}): BatchGenerationTarget {
  return {
    key: "character-1",
    targetType: "character",
    targetId: "entity-1",
    name: "林远",
    detail: "角色定妆",
    prompt: "portrait prompt",
    aspect: "portrait",
    ...patch,
  }
}

function asset(id: string): GeneratedAsset {
  return {
    id,
    taskId: `task-${id}`,
    projectId: "project-1",
    targetType: "character",
    targetId: "entity-1",
    storageKey: `${id}.png`,
    mime: "image/png",
    bytes: 10,
    providerId: "aliyun",
    model: "wanx2.1-t2i-turbo",
    prompt: "prompt",
    selectedAt: null,
    createdAt: Date.now(),
    downloadUrl: `/api/generated-assets/${id}`,
  }
}

test("BATCH1 只把有提示词且未阻塞的目标视为可生成", () => {
  const targets = [
    target(),
    target({ key: "character-2", prompt: "  " }),
    target({ key: "place-1", targetType: "place", blockedReason: "缺地点锚点" }),
  ]

  assert.deepEqual(eligibleBatchTargets(targets).map((item) => item.key), ["character-1"])
})

test("BATCH2 批量执行严格遵守低并发，单项失败不终止其余任务", async () => {
  let active = 0
  let maxActive = 0
  const completed: string[] = []
  const outcomes = await runBatchGeneration(
    ["a", "b", "c", "d"].map((key) => target({ key, targetId: key })),
    {
      concurrency: 2,
      run: async (item) => {
        active += 1
        maxActive = Math.max(maxActive, active)
        await new Promise((resolve) => setTimeout(resolve, item.key === "b" ? 20 : 5))
        active -= 1
        if (item.key === "b") throw new Error("模拟失败")
        completed.push(item.key)
        return asset(item.key)
      },
    },
  )

  assert.equal(maxActive, 2)
  assert.deepEqual(completed.sort(), ["a", "c", "d"])
  assert.equal(outcomes.find((item) => item.key === "b")?.status, "failed")
  assert.equal(outcomes.filter((item) => item.status === "succeeded").length, 3)
})

test("BATCH3 时间预估按并发波次计算，不伪装成精确耗时", () => {
  const estimate = estimateBatchDuration(5, 2)
  assert.equal(estimate.waves, 3)
  assert.match(estimate.label, /约/)
  assert.match(estimate.label, /实际/)
  assert.equal(estimateBatchDuration(0, 2).label, "无需排队")
  assert.equal(estimateBatchDuration(1, 0).waves, 1)
})

test("BATCH3b 已停止时不再提交任何目标，全部标记为停止排队", async () => {
  const controller = new AbortController()
  controller.abort()
  let calls = 0
  const statuses: string[] = []
  const outcomes = await runBatchGeneration(
    [target({ key: "a" }), target({ key: "b" })],
    {
      signal: controller.signal,
      run: async () => {
        calls += 1
        return asset("unexpected")
      },
      onProgress: (_item, status) => statuses.push(status),
    },
  )

  assert.equal(calls, 0)
  assert.deepEqual(outcomes.map((item) => item.status), ["canceled", "canceled"])
  assert.deepEqual(statuses, ["canceled", "canceled"])
})

test("BATCH3c 非 Error 异常也会归到单项失败，不影响队列结构", async () => {
  const outcomes = await runBatchGeneration([target()], {
    run: async () => {
      throw "provider disconnected"
    },
  })
  assert.equal(outcomes[0].status, "failed")
  assert.equal(outcomes[0].error, "生成失败，请重试")
})

test("BATCH4 三类生图入口挂载统一批量工具，批量请求不自动采用", () => {
  const read = (path: string) => fs.existsSync(path) ? fs.readFileSync(path, "utf8") : ""
  const panel = read("components/BatchGenerationPanel.tsx")
  const visual = read("components/VisualAnchorPanel.tsx")
  const place = read("components/PlacePanel.tsx")
  const shotList = read("components/ShotList.tsx")
  const client = read("lib/generation/client.ts")
  const route = read("app/api/generations/route.ts")
  const keyframe = read("components/KeyframePanel.tsx")

  assert.ok(panel.includes("低并发 2"), "批量面板没有说明并发上限")
  assert.ok(panel.includes("不会自动采用"), "批量面板没有说明采用策略")
  assert.ok(panel.includes("采用全部"), "缺少显式批量采用")
  assert.ok(visual.includes("<BatchGenerationPanel"), "角色定妆没有接入批量生成")
  assert.ok(place.includes("<BatchGenerationPanel"), "地点场景没有接入批量生成")
  assert.ok(shotList.includes("<BatchGenerationPanel"), "镜头首帧没有接入批量生成")
  assert.ok(client.includes("autoSelect"), "生成客户端无法表达候选模式")
  assert.ok(route.includes("autoSelect"), "生成接口无法保留已采用版本")
  assert.ok(keyframe.includes("候选版本 · 尚未采用"), "生成卡没有区分候选与已采用")
  assert.ok(keyframe.includes("采用这张"), "候选图缺少人工采用入口")
})

test("BATCH5 分镜支持按集筛选、集数深链和当前范围批量", () => {
  const list = fs.readFileSync("components/ShotList.tsx", "utf8")
  assert.ok(list.includes("?episode="), "分镜筛选没有写入 URL")
  assert.ok(list.includes("searchParams"), "分镜列表没有读取集数深链")
  assert.ok(list.includes("第 ${selectedEpisode} 集"), "缺少当前集筛选展示")
  assert.ok(list.includes("visibleShots"), "批量范围没有跟随当前筛选")
})

test("BATCH6 批量生成默认保存候选，不覆盖当前采用图", async () => {
  __resetDbForTests(":memory:")
  const db = getDbForRequest()
  const project = createProject(db, "批量候选", OWNER)
  createSnapshot(db, {
    projectId: project.id,
    kind: "visualCharacters",
    payload: [{ id: "visual-row-1", entityId: "character-entity-1", name: "林远" }],
  })
  const previousTask = createGenerationTask(db, {
    projectId: project.id,
    targetType: "character",
    targetId: "character-entity-1",
    providerId: "aliyun",
    model: "wanx2.1-t2i-turbo",
    prompt: "previous portrait",
  })
  const previousFile = writeGeneratedImage(project.id, previousTask.id, PNG, "image/png")
  const previousAsset = saveGeneratedAsset(db, {
    taskId: previousTask.id,
    projectId: project.id,
    targetType: "character",
    targetId: "character-entity-1",
    storageKey: previousFile.storageKey,
    mime: "image/png",
    bytes: previousFile.bytes,
    providerId: "aliyun",
    model: "wanx2.1-t2i-turbo",
    prompt: "previous portrait",
  })
  selectGeneratedAsset(db, project.id, previousAsset.id)

  const originalFetch = globalThis.fetch
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input)
    if (url.endsWith("/image-synthesis")) {
      return Response.json({ output: { task_id: "batch-task", task_status: "PENDING" } })
    }
    if (url.endsWith("/api/v1/tasks/batch-task")) {
      return Response.json({
        output: {
          task_status: "SUCCEEDED",
          results: [{ url: "https://cdn.example.com/batch.png" }],
        },
      })
    }
    if (url.endsWith("/multimodal-generation/generation")) {
      return Response.json({
        output: {
          choices: [{
            message: {
              content: [{ image: "https://cdn.example.com/batch-edit.png" }],
            },
          }],
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
        targetType: "character",
        targetId: "character-entity-1",
        prompt: "character portrait",
        aspect: "portrait",
        autoSelect: false,
      }),
    }))
    const payload = await res.json()

    assert.equal(res.status, 200, payload.error)
    assert.equal(payload.data.asset.selectedAt, null)
    const assets = listGeneratedAssets(db, project.id, "character", "character-entity-1")
    assert.equal(assets.find((item) => item.selectedAt)?.id, previousAsset.id)
  } finally {
    globalThis.fetch = originalFetch
    delete process.env.ALIYUN_DASHSCOPE_API_KEY
    delete process.env.ALIYUN_IMAGE_MODEL
  }
})

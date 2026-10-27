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
import { createBatchRunStore } from "../lib/generation/batch-store.ts"
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

test("BATCH7 切换步骤卸载订阅后，批量任务继续并保留已生成候选", async () => {
  const store = createBatchRunStore()
  const pending = new Map<string, (value: GeneratedAsset) => void>()
  const targets = [
    target({ key: "a", targetId: "a" }),
    target({ key: "b", targetId: "b" }),
  ]
  const unsubscribe = store.subscribe("project-1:visuals", () => {})
  const run = store.start("project-1:visuals", {
    projectId: "project-1",
    targets,
    look: { palette: "", light: "", lens: "", banned: "" },
    runner: (item) => new Promise<GeneratedAsset>((resolve) => pending.set(item.key, resolve)),
  })

  const deadline = Date.now() + 1000
  while (pending.size < 2 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  assert.equal(pending.size, 2)
  unsubscribe()

  pending.get("a")!(asset("a"))
  await new Promise((resolve) => setTimeout(resolve, 10))
  const mid = store.getSnapshot("project-1:visuals")
  assert.equal(mid.running, true)
  assert.equal(mid.statuses.a, "succeeded")
  assert.equal(mid.assets.a?.id, "a")

  pending.get("b")!(asset("b"))
  await run
  const finished = store.getSnapshot("project-1:visuals")
  assert.equal(finished.running, false)
  assert.equal(finished.statuses.b, "succeeded")
  assert.match(finished.notice || "", /本批完成 2 项/)
})

test("BATCH8 页面接入持久批量控制器，步骤组件不再卸载即 abort", () => {
  const read = (path: string) => fs.readFileSync(path, "utf8")
  const panel = read("components/BatchGenerationPanel.tsx")
  const visual = read("components/VisualAnchorPanel.tsx")
  const place = read("components/PlacePanel.tsx")
  const shots = read("components/ShotList.tsx")

  assert.ok(panel.includes("useSyncExternalStore"), "批量面板没有订阅页面级状态")
  assert.ok(panel.includes("batchRunStore"), "批量面板没有使用持久控制器")
  assert.equal(panel.includes("controllerRef.current?.abort()"), false, "卸载仍会主动 abort")
  assert.ok(visual.includes('scope="visuals"'), "角色定妆没有稳定批次作用域")
  assert.ok(place.includes('scope="places"'), "地点场景没有稳定批次作用域")
  assert.ok(shots.includes('scope="shots"'), "镜头首帧没有稳定批次作用域")
})

test("BATCH9 停止排队会取消当前等待并保留持久状态", async () => {
  const store = createBatchRunStore()
  const pending = new Map<string, (reason?: unknown) => void>()
  const run = store.start("project-stop:visuals", {
    projectId: "project-stop",
    targets: [target({ key: "a", targetId: "a" }), target({ key: "b", targetId: "b" })],
    look: { palette: "", light: "", lens: "", banned: "" },
    runner: (item, signal) => new Promise<GeneratedAsset>((_resolve, reject) => {
      pending.set(item.key, reject)
      signal?.addEventListener("abort", () => {
        const error = new Error("aborted")
        error.name = "AbortError"
        reject(error)
      }, { once: true })
    }),
  })
  const deadline = Date.now() + 1000
  while (pending.size < 2 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  store.stop("project-stop:visuals")
  assert.equal(store.getSnapshot("project-stop:visuals").stopping, true)
  await run
  const state = store.getSnapshot("project-stop:visuals")
  assert.equal(state.running, false)
  assert.match(state.notice || "", /已停止等待/)
  assert.deepEqual(state.statuses, { a: "canceled", b: "canceled" })
})

test("BATCH10 持久控制器支持逐张与批量采用", async () => {
  const selectedIds: string[] = []
  const store = createBatchRunStore({
    selectAsset: async (_projectId, assetId) => {
      selectedIds.push(assetId)
      return { ...asset(assetId), selectedAt: Date.now() }
    },
  })
  const targets = [
    target({ key: "a", targetId: "a" }),
    target({ key: "b", targetId: "b" }),
  ]
  await store.start("project-adopt:visuals", {
    projectId: "project-adopt",
    targets,
    look: { palette: "", light: "", lens: "", banned: "" },
    runner: async (item) => asset(item.key),
  })
  await store.adoptCandidate("project-adopt:visuals", "project-adopt", targets[0])
  assert.deepEqual(store.getSnapshot("project-adopt:visuals").adoptedKeys, ["a"])
  await store.adoptAll("project-adopt:visuals", "project-adopt", targets)
  const state = store.getSnapshot("project-adopt:visuals")
  assert.deepEqual(new Set(state.adoptedKeys), new Set(["a", "b"]))
  assert.deepEqual(selectedIds.sort(), ["a", "b"])
  assert.match(state.notice || "", /已采用 1 张候选图/)
})

import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

import { openDb } from "../lib/assets/db.ts"
import { createProject } from "../lib/assets/repo.ts"
import { postSse } from "../lib/api.ts"
import {
  checkpointSignature,
  clearTextGenerationCheckpoint,
  loadTextGenerationCheckpoint,
  saveTextGenerationCheckpoint,
} from "../lib/generation/checkpoint.ts"

test("checkpoint 签名对同类输入稳定，对不同类型或内容变化", () => {
  const input = { idea: "快递员", count: 60, characters: ["林远"] }
  const first = checkpointSignature("episodes", input)
  const second = checkpointSignature("episodes", { characters: ["林远"], count: 60, idea: "快递员" })
  assert.equal(first, second)
  assert.notEqual(first, checkpointSignature("shots", input))
  assert.notEqual(first, checkpointSignature("episodes", { ...input, count: 30 }))
})

test("checkpoint 保存、读取、更新并校验项目、类型和签名", () => {
  const db = openDb(":memory:")
  try {
    const owner = `anon_${"c".repeat(48)}`
    const projectA = createProject(db, "checkpoint A", owner).id
    const projectB = createProject(db, "checkpoint B", owner).id
    const signature = checkpointSignature("episodes", { count: 60 })
    const saved = saveTextGenerationCheckpoint(db, {
      projectId: projectA,
      kind: "episodes",
      signature,
      cursor: 21,
      state: { episodes: [{ number: 1 }], stamp: 100 },
    })
    assert.ok(saved.updatedAt > 0)

    const loaded = loadTextGenerationCheckpoint<{ episodes: unknown[]; stamp: number }>(
      db,
      projectA,
      "episodes",
      signature,
    )
    assert.equal(loaded?.cursor, 21)
    assert.deepEqual(loaded?.state, { episodes: [{ number: 1 }], stamp: 100 })
    assert.equal(loadTextGenerationCheckpoint(db, projectB, "episodes", signature), null)
    assert.equal(loadTextGenerationCheckpoint(db, projectA, "shots", signature), null)
    assert.equal(loadTextGenerationCheckpoint(db, projectA, "episodes", "wrong"), null)

    saveTextGenerationCheckpoint(db, {
      projectId: projectA,
      kind: "episodes",
      signature,
      cursor: 31,
      state: { episodes: [{ number: 1 }, { number: 2 }], stamp: 100 },
    })
    assert.equal(loadTextGenerationCheckpoint(db, projectA, "episodes", signature)?.cursor, 31)
    assert.equal(clearTextGenerationCheckpoint(db, projectA, "episodes"), true)
    assert.equal(loadTextGenerationCheckpoint(db, projectA, "episodes", signature), null)

    saveTextGenerationCheckpoint(db, {
      projectId: projectA,
      kind: "shots",
      signature,
      cursor: 9,
      state: { shots: [], stamp: 1 },
    })
    db.prepare("DELETE FROM projects WHERE id = ?").run(projectA)
    assert.equal(loadTextGenerationCheckpoint(db, projectA, "shots", signature), null)
  } finally {
    db.close()
  }
})

test("分集、分镜和前端都接入续跑参数与 checkpoint 生命周期", () => {
  const episodes = fs.readFileSync("app/api/episodes/route.ts", "utf8")
  const shots = fs.readFileSync("app/api/shots/route.ts", "utf8")
  const page = fs.readFileSync("app/page.tsx", "utf8")
  for (const source of [episodes, shots]) {
    assert.ok(source.includes("checkpointSignature"))
    assert.ok(source.includes("loadTextGenerationCheckpoint"))
    assert.ok(source.includes("saveTextGenerationCheckpoint"))
    assert.ok(source.includes("clearTextGenerationCheckpoint"))
    assert.ok(source.includes("resume"))
  }
  assert.ok(page.includes("episodeCheckpointRef"))
  assert.ok(page.includes("shotCheckpointRef"))
  assert.ok(page.includes("resume: episodeCheckpointRef.current"))
  assert.ok(page.includes("resume: shotCheckpointRef.current"))
})

test("SSE error 事件会把断点可用信息带回前端", async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () => new Response(
    'event: error\ndata: {"error":"批次失败","resume":{"available":true,"cursor":21}}\n\n',
    { status: 200, headers: { "content-type": "text/event-stream" } },
  )) as typeof fetch
  try {
    await assert.rejects(
      () => postSse("/api/episodes", {}, () => {}),
      (error: Error & { resume?: { available?: boolean; cursor?: number } }) => {
        assert.match(error.message, /批次失败/)
        assert.deepEqual(error.resume, { available: true, cursor: 21 })
        return true
      },
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})

import { test } from "node:test"
import assert from "node:assert/strict"

import type { GeneratedAsset } from "../lib/generation/types.ts"
import { buildInitialTimeline } from "../lib/timeline/initial.ts"

function video(
  id: string,
  targetId: string,
  durationMs: number,
  sha256: string,
  selectedAt: number | null,
): GeneratedAsset {
  return {
    id,
    taskId: `task-${id}`,
    projectId: "project-timeline",
    targetType: "shot",
    targetId,
    storageKey: `generated/project-timeline/${id}.mp4`,
    mime: "video/mp4",
    bytes: 100,
    providerId: "minimax",
    model: "MiniMax-H3-Lite",
    prompt: "video",
    mediaKind: "video",
    durationMs,
    sha256,
    selectedAt,
    createdAt: selectedAt ?? 1,
    downloadUrl: `/api/generated-assets/${id}`,
  }
}

test("P1-V5 初始时间线按集过滤、按镜号排序并标记缺镜和时长异常", () => {
  const result = buildInitialTimeline({
    projectId: "project-timeline",
    episode: 1,
    shots: [
      {
        id: "row-3",
        entityId: "shot-3",
        episode: 1,
        shot: 3,
        scene: "天台",
        params: { duration: 5 },
      },
      {
        id: "row-2",
        entityId: "shot-2",
        episode: 2,
        shot: 1,
        scene: "别集",
        params: { duration: 10 },
      },
      {
        id: "row-2a",
        entityId: "shot-2a",
        episode: 1,
        shot: 2,
        scene: "走廊",
        params: { duration: 10 },
      },
      {
        id: "row-1",
        entityId: "shot-1",
        episode: 1,
        shot: 1,
        scene: "雨夜",
        params: { duration: 5 },
      },
    ],
    videos: [
      video("asset-1", "shot-1", 5_400, "hash-1", 10),
      video("asset-2", "shot-2a", 10_000, "hash-2", 20),
      video("asset-old", "shot-1", 5_000, "hash-old", null),
    ],
  })

  assert.deepEqual(
    result.payload.clips.map((clip) => [clip.shotId, clip.status]),
    [
      ["shot-1", "duration-mismatch"],
      ["shot-2a", "ready"],
      ["shot-3", "missing-video"],
    ],
  )
  assert.equal(result.payload.readyCount, 1)
  assert.equal(result.payload.blockedCount, 2)
  assert.equal(result.payload.totalDurationMs, 20_400)
  assert.equal(result.payload.clips[0].sourceAssetId, "asset-1")
  assert.equal(result.payload.clips[1].sourceAssetId, "asset-2")
  assert.equal(result.payload.clips[2].sourceAssetId, null)
  assert.equal(result.payload.clips[2].durationMs, 5_000)
  assert.deepEqual(result.inputHashes, {
    "asset-1": "hash-1",
    "asset-2": "hash-2",
  })
})

test("P1-V5 空集或没有有效镜头时返回可解释的阻断时间线", () => {
  const result = buildInitialTimeline({
    projectId: "project-timeline",
    episode: 3,
    shots: [{ entityId: "other", episode: 1, shot: 1 }],
    videos: [],
  })

  assert.deepEqual(result.payload.clips, [])
  assert.equal(result.payload.readyCount, 0)
  assert.equal(result.payload.blockedCount, 0)
  assert.equal(result.payload.totalDurationMs, 0)
  assert.equal(result.payload.episode, 3)
})

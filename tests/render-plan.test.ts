import { test } from "node:test"
import assert from "node:assert/strict"

import type { GeneratedAsset, GenerationTask } from "../lib/generation/types.ts"
import type { TimelinePayload } from "../lib/timeline/types.ts"
import {
  buildTimelineSrt,
  inspectTimelineDialogue,
} from "../lib/video/render-plan.ts"

function timeline(): TimelinePayload {
  return {
    schemaVersion: 1,
    projectId: "project-render",
    episode: 1,
    fps: 30,
    clips: [
      {
        id: "clip-1",
        shotId: "shot-1",
        shotNumber: 1,
        scene: "天台",
        sourceAssetId: "video-1",
        sourceDurationMs: 2_000,
        durationMs: 2_000,
        expectedDurationMs: 2_000,
        inMs: 0,
        outMs: 2_000,
        muted: false,
        volume: 1,
        status: "ready",
        reason: null,
      },
      {
        id: "clip-2",
        shotId: "shot-2",
        shotNumber: 2,
        scene: "走廊",
        sourceAssetId: "video-2",
        sourceDurationMs: 3_000,
        durationMs: 3_000,
        expectedDurationMs: 3_000,
        inMs: 0,
        outMs: 3_000,
        muted: false,
        volume: 1,
        status: "ready",
        reason: null,
      },
    ],
    readyCount: 2,
    blockedCount: 0,
    totalDurationMs: 5_000,
    subtitle: { enabled: true },
    audio: { dialogueVolume: 1, bgmAssetId: null, bgmVolume: 0.2 },
  }
}

function taskAndAsset(input: {
  id: string
  shotId: string
  dialogue: string
  durationMs: number
  createdAt: number
}): { task: GenerationTask; asset: GeneratedAsset } {
  const task: GenerationTask = {
    id: `task-${input.id}`,
    projectId: "project-render",
    targetType: "shot",
    targetId: input.shotId,
    providerId: "minimax",
    model: "speech-02-hd",
    prompt: input.dialogue,
    promptHash: `hash-${input.id}`,
    status: "succeeded",
    error: null,
    assetId: `asset-${input.id}`,
    mediaKind: "audio",
    createdAt: input.createdAt,
    startedAt: input.createdAt,
    finishedAt: input.createdAt + 1,
  }
  const asset: GeneratedAsset = {
    id: `asset-${input.id}`,
    taskId: task.id,
    projectId: "project-render",
    targetType: "shot",
    targetId: input.shotId,
    storageKey: `generated/project-render/${input.id}.mp3`,
    mime: "audio/mpeg",
    bytes: 100,
    providerId: "minimax",
    model: "speech-02-hd",
    prompt: input.dialogue,
    mediaKind: "audio",
    durationMs: input.durationMs,
    sha256: `audio-hash-${input.id}`,
    selectedAt: null,
    createdAt: input.createdAt,
    downloadUrl: `/api/generated-assets/asset-${input.id}`,
  }
  return { task, asset }
}

test("P1-V5.12 对白音频选择当前台词最新版本，并保留试听地址", () => {
  const oldLine = taskAndAsset({
    id: "old",
    shotId: "shot-1",
    dialogue: "你终于来了。",
    durationMs: 1_400,
    createdAt: 10,
  })
  const latestLine = taskAndAsset({
    id: "latest",
    shotId: "shot-1",
    dialogue: "你终于来了。",
    durationMs: 1_500,
    createdAt: 20,
  })
  const inspection = inspectTimelineDialogue({
    timeline: timeline(),
    shots: [
      { entityId: "shot-1", shot: 1, speaker: "林晚", dialogue: "你终于来了。" },
      { entityId: "shot-2", shot: 2, speaker: "周沉", dialogue: "我一直在。" },
    ],
    tasks: [oldLine.task, latestLine.task],
    assets: [oldLine.asset, latestLine.asset],
  })

  assert.equal(inspection.lines[0].assetId, "asset-latest")
  assert.equal(inspection.lines[0].durationMs, 1_500)
  assert.equal(
    inspection.lines[0].previewUrl,
    "/api/generated-assets/asset-latest",
  )
  assert.equal(inspection.lines[1].assetId, null)
  assert.equal(inspection.issues[0].code, "missing-dialogue-audio")
})

test("P1-V5.13 对白超出时间线有效时长时阻断并指出镜头", () => {
  const tooLong = taskAndAsset({
    id: "long",
    shotId: "shot-1",
    dialogue: "你终于来了。",
    durationMs: 2_400,
    createdAt: 30,
  })
  const second = taskAndAsset({
    id: "second",
    shotId: "shot-2",
    dialogue: "我一直在。",
    durationMs: 2_000,
    createdAt: 31,
  })
  const inspection = inspectTimelineDialogue({
    timeline: timeline(),
    shots: [
      { entityId: "shot-1", shot: 1, speaker: "林晚", dialogue: "你终于来了。" },
      { entityId: "shot-2", shot: 2, speaker: "周沉", dialogue: "我一直在。" },
    ],
    tasks: [tooLong.task, second.task],
    assets: [tooLong.asset, second.asset],
  })

  assert.equal(inspection.issues.length, 1)
  assert.equal(inspection.issues[0].code, "dialogue-overflow")
  assert.equal(inspection.issues[0].shotNumber, 1)
  assert.match(inspection.issues[0].message, /2\.4.*2\.0/)
})

test("P1-V5.14 SRT 使用实际镜头顺序、累计时间和当前台词", () => {
  const srt = buildTimelineSrt({
    timeline: timeline(),
    shots: [
      { entityId: "shot-1", shot: 1, speaker: "林晚", dialogue: "你终于来了。" },
      { entityId: "shot-2", shot: 2, speaker: "周沉", dialogue: "我一直在。\n别怕。" },
    ],
  })

  assert.equal(
    srt,
    [
      "1",
      "00:00:00,000 --> 00:00:02,000",
      "林晚：你终于来了。",
      "",
      "2",
      "00:00:02,000 --> 00:00:05,000",
      "周沉：我一直在。 别怕。",
      "",
      "",
    ].join("\n"),
  )
})

test("P1-V5.13 静音镜头不要求 TTS，但台词仍可进入字幕", () => {
  const muted = timeline()
  muted.clips[0] = { ...muted.clips[0], muted: true }
  const inspection = inspectTimelineDialogue({
    timeline: muted,
    shots: [
      { entityId: "shot-1", shot: 1, speaker: "林晚", dialogue: "你终于来了。" },
      { entityId: "shot-2", shot: 2, speaker: "周沉", dialogue: "我一直在。" },
    ],
    tasks: [],
    assets: [],
  })

  assert.equal(inspection.issues.some((issue) => issue.code === "missing-dialogue-audio" && issue.shotNumber === 1), false)
  assert.match(buildTimelineSrt({
    timeline: muted,
    shots: [
      { entityId: "shot-1", shot: 1, speaker: "林晚", dialogue: "你终于来了。" },
      { entityId: "shot-2", shot: 2, speaker: "周沉", dialogue: "我一直在。" },
    ],
  }), /林晚：你终于来了。/)
})

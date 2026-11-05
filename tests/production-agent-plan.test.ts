import { test } from "node:test"
import assert from "node:assert/strict"

import { createToolExecutors, type AgentState } from "../lib/agent/tools.ts"
import { EMPTY_BRIEF } from "../lib/brief.ts"
import { countSpeechCharacters } from "../lib/audio/text.ts"
import type { GeneratedAsset, GenerationTask } from "../lib/generation/types.ts"
import { buildMobileVideoView } from "../lib/mobile-video.ts"

function asset(over: Partial<GeneratedAsset>): GeneratedAsset {
  return {
    id: "video-1",
    taskId: "task-video-1",
    projectId: "project-1",
    targetType: "shot",
    targetId: "shot-1",
    storageKey: "generated/project/video-1.mp4",
    mime: "video/mp4",
    bytes: 1_000,
    providerId: "minimax",
    model: "MiniMax-H3-Lite",
    prompt: "prompt",
    mediaKind: "video",
    durationMs: 4_000,
    width: 720,
    height: 1280,
    fps: 30,
    sha256: "hash-video-1",
    posterStorageKey: null,
    sourceAssetIds: [],
    generationMeta: {},
    selectedAt: 1,
    createdAt: 1,
    downloadUrl: "/api/generated-assets/video-1",
    ...over,
  }
}

const shot = (over: Record<string, unknown> = {}) => ({
  targetId: "shot-1",
  episode: 1,
  shot: 1,
  scene: "天台",
  characters: ["林晚"],
  missingRefFor: [],
  status: "todo",
  shotSize: "中景",
  camera: "固定",
  prompt: "medium shot",
  action: "林晚回头",
  speaker: "林晚",
  dialogue: "你终于来了。",
  ...over,
})

function state(over: Partial<AgentState> = {}): AgentState {
  const shots = [
    shot(),
    shot({
      targetId: "shot-2",
      shot: 2,
      scene: "走廊",
      speaker: "",
      dialogue: "",
    }),
  ]
  const videoAssets = [
    asset({}),
    asset({
      id: "video-2",
      taskId: "task-video-2",
      targetId: "shot-2",
      durationMs: 7_000,
      width: 1080,
      height: 1920,
      sha256: "hash-video-2",
      selectedAt: 2,
      createdAt: 2,
      downloadUrl: "/api/generated-assets/video-2",
    }),
  ]
  const tasks: GenerationTask[] = []
  return {
    projectTitle: "成片提案",
    hasIdea: true,
    brief: EMPTY_BRIEF,
    judgments: [],
    decisions: [],
    canonIssues: [],
    characters: [{ name: "林晚", motivation: "寻找真相", arc: "从逃避到面对" }],
    episodes: [{ number: 1, title: "雨夜", hook: "门外是谁？" }],
    completed: {
      characters: true,
      acts: true,
      episodes: true,
      visuals: true,
      scenes: true,
      shots: true,
    },
    shots,
    expiredShots: 0,
    quota: null,
    videoAssets,
    videoTargets: buildMobileVideoView({
      shots: [
        { entityId: "shot-1", episode: 1, shot: 1, scene: "天台", prompt: "prompt", params: { duration: 4, ratio: "9:16" } },
        { entityId: "shot-2", episode: 1, shot: 2, scene: "走廊", prompt: "prompt", params: { duration: 5, ratio: "9:16" } },
      ],
      assets: videoAssets,
      tasks,
    }).targets,
    voiceProfiles: [
      {
        characterName: "林晚",
        characterEntityId: "character-1",
        voiceId: "warm-female",
        label: "温润女声",
      },
    ],
    ttsPricePer1kCharsMicros: 350_000,
    timelineVersions: [
      {
        episode: 1,
        versionId: "version-1",
        revision: 2,
        readyCount: 2,
        blockedCount: 0,
        totalDurationMs: 9_000,
      },
    ],
    ...over,
  }
}

test("P2 视频质检区分缺片、时长和画幅异常，只读不生成任务", () => {
  const s = state({
    videoAssets: [
      asset({ durationMs: 8_000, width: 1920, height: 1080 }),
    ],
  })
  const before = JSON.stringify(s)
  const result = createToolExecutors(s).audit_video_quality({ episode: 1 })

  assert.equal(result.ok, true)
  assert.match(result.content, /2 镜/)
  assert.match(result.content, /第 1 镜/)
  assert.match(result.content, /时长/)
  assert.match(result.content, /画幅/)
  assert.match(result.content, /缺少已采用视频/)
  assert.equal(JSON.stringify(s), before)
})

test("P2 返修提案只生成卡片，不触发视频重生成", () => {
  const s = state()
  const result = createToolExecutors(s).propose_video_rework({
    episode: 1,
    shotIds: ["shot-2"],
    reason: "第二镜时长和画幅不符合当前分镜参数",
  })

  assert.equal(result.ok, true)
  assert.equal(result.card?.kind, "video-rework")
  assert.match(result.content, /尚未创建付费任务/)
})

test("P2 时间线、音色与 TTS 提案均不修改状态或创建任务", () => {
  const s = state()
  const before = JSON.stringify(s)
  const exec = createToolExecutors(s)

  const timeline = exec.propose_timeline_update({
    episode: 1,
    operations: [
      { shotId: "shot-1", type: "move", position: 2 },
      { shotId: "shot-2", type: "mute" },
    ],
  })
  assert.equal(timeline.ok, true)
  assert.equal(timeline.card?.kind, "timeline-plan")

  const voices = exec.propose_voice_bindings({
    bindings: [{ characterName: "林晚", voiceId: "warm-female" }],
  })
  assert.equal(voices.ok, true)
  assert.equal(voices.card?.kind, "voice-plan")

  const lines = s.shots.filter((item) => item.episode === 1 && item.dialogue.trim())
  const characters = lines.reduce((sum, item) => sum + countSpeechCharacters(item.dialogue), 0)
  const tts = exec.propose_tts_batch({
    episode: 1,
    maxBudgetMicros: 10_000,
  })
  assert.equal(tts.ok, true)
  assert.equal(tts.card?.kind, "tts-plan")
  assert.match(tts.content, new RegExp(`${characters} 字符`))
  assert.equal(JSON.stringify(s), before)
})

test("P2 成片提案使用已固化版本和真实就绪度，但不加入渲染队列", () => {
  const s = state()
  const before = JSON.stringify(s)
  const result = createToolExecutors(s).propose_episode_render({ episode: 1 })

  assert.equal(result.ok, true)
  assert.equal(result.card?.kind, "render-plan")
  assert.match(result.content, /2\/2 镜/)
  assert.match(result.content, /v2/)
  assert.match(result.content, /尚未加入渲染队列/)
  assert.equal(JSON.stringify(s), before)
})

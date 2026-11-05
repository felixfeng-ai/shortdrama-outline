import { test } from "node:test"
import assert from "node:assert/strict"

import { openDb } from "../lib/assets/db.ts"
import { createProject, createSnapshot } from "../lib/assets/repo.ts"
import {
  completeGenerationTask,
  createGenerationTask,
  saveGeneratedAsset,
  selectGeneratedAsset,
  type GeneratedAsset,
} from "../lib/generation/repo.ts"
import {
  freezeTimelineVersion,
  getTimelineDraft,
  initializeEpisodeTimeline,
  listTimelineVersions,
  saveTimelineDraft,
} from "../lib/timeline/repo.ts"

function setup() {
  const db = openDb(":memory:")
  const project = createProject(db, "时间线测试", "owner-timeline")
  createSnapshot(db, {
    projectId: project.id,
    kind: "shots",
    payload: [
      {
        id: "row-shot-2",
        entityId: "shot-2",
        episode: 1,
        shot: 2,
        scene: "走廊",
        params: { duration: 10 },
      },
      {
        id: "row-shot-1",
        entityId: "shot-1",
        episode: 1,
        shot: 1,
        scene: "雨夜",
        params: { duration: 5 },
      },
      {
        id: "row-shot-3",
        entityId: "shot-3",
        episode: 1,
        shot: 3,
        scene: "天台",
        params: { duration: 5 },
      },
      {
        id: "row-other",
        entityId: "shot-other",
        episode: 2,
        shot: 1,
        scene: "别集",
        params: { duration: 5 },
      },
    ],
  })
  const videos: Record<string, GeneratedAsset> = {}
  const addVideo = (
    targetId: string,
    durationMs: number,
    selected: boolean,
    key = targetId,
  ) => {
    const task = createGenerationTask(db, {
      projectId: project.id,
      targetType: "shot",
      targetId,
      providerId: "minimax",
      model: "MiniMax-H3-Lite",
      prompt: targetId,
      mediaKind: "video",
    })
    const asset = saveGeneratedAsset(db, {
      taskId: task.id,
      projectId: project.id,
      targetType: "shot",
      targetId,
      storageKey: `generated/${project.id}/${targetId}.mp4`,
      mime: "video/mp4",
      bytes: 100,
      providerId: "minimax",
      model: "MiniMax-H3-Lite",
      prompt: targetId,
      mediaKind: "video",
      durationMs,
      sha256: `hash-${targetId}`,
    })
    completeGenerationTask(db, task.id, asset.id)
    if (selected) selectGeneratedAsset(db, project.id, asset.id)
    videos[key] = asset
    return asset
  }
  addVideo("shot-1", 5_000, true, "shot-1-current")
  addVideo("shot-2", 10_000, true, "shot-2-current")
  addVideo("shot-1", 6_000, false, "shot-1-alt")
  return { db, project, videos }
}

test("P1-V5 首次初始化时间线幂等，并保留缺镜阻断项", () => {
  const { db, project } = setup()
  const first = initializeEpisodeTimeline(db, project.id, 1)
  const repeated = initializeEpisodeTimeline(db, project.id, 1)

  assert.equal(first.created, true)
  assert.equal(first.draft.revision, 1)
  assert.deepEqual(first.draft.payload.clips.map((clip) => clip.shotId), ["shot-1", "shot-2", "shot-3"])
  assert.equal(first.draft.payload.readyCount, 2)
  assert.equal(first.draft.payload.blockedCount, 1)
  assert.equal(first.draft.payload.clips[2].status, "missing-video")
  assert.equal(repeated.created, false)
  assert.equal(repeated.draft.id, first.draft.id)
  assert.equal(getTimelineDraft(db, project.id, 1)?.revision, 1)
})

test("P1-V5 草稿使用乐观锁，固化版本后后续编辑不改写历史", () => {
  const { db, project } = setup()
  const initialized = initializeEpisodeTimeline(db, project.id, 1)
  const firstVersion = freezeTimelineVersion(db, project.id, 1, 1)
  assert.throws(
    () => saveTimelineDraft(db, project.id, 1, 1, {
      ...initialized.draft.payload,
      clips: initialized.draft.payload.clips.slice(0, 1),
    }),
    /不能通过重排接口增删镜头/,
  )
  const reversed = {
    ...initialized.draft.payload,
    clips: [...initialized.draft.payload.clips].reverse(),
  }
  const saved = saveTimelineDraft(db, project.id, 1, 1, reversed)
  assert.equal(saved.revision, 2)

  assert.throws(
    () => saveTimelineDraft(db, project.id, 1, 1, initialized.draft.payload),
    (error) => error instanceof Error && "status" in error && error.status === 409,
  )

  const secondVersion = freezeTimelineVersion(db, project.id, 1, 2)
  const versions = listTimelineVersions(db, project.id, 1)
  assert.equal(firstVersion.revision, 1)
  assert.equal(secondVersion.revision, 2)
  assert.deepEqual(
    versions.find((version) => version.revision === 1)?.payload.clips.map((clip) => clip.shotId),
    ["shot-1", "shot-2", "shot-3"],
  )
  assert.deepEqual(
    versions.find((version) => version.revision === 2)?.payload.clips.map((clip) => clip.shotId),
    ["shot-3", "shot-2", "shot-1"],
  )
})

test("P1-V5 裁剪受源视频边界约束，替换素材后由服务端重算状态", () => {
  const { db, project, videos } = setup()
  const initialized = initializeEpisodeTimeline(db, project.id, 1)
  const firstClip = initialized.draft.payload.clips[0]
  const trimmedClips = initialized.draft.payload.clips.map((clip, index) =>
    index === 0
      ? {
          ...clip,
          inMs: 1_000,
          outMs: 4_500,
          durationMs: 3_500,
        }
      : clip
  )
  const trimmed = saveTimelineDraft(db, project.id, 1, 1, {
    ...initialized.draft.payload,
    clips: trimmedClips,
  })
  assert.equal(trimmed.revision, 2)
  assert.equal(trimmed.payload.clips[0].inMs, 1_000)
  assert.equal(trimmed.payload.clips[0].outMs, 4_500)

  assert.throws(
    () => saveTimelineDraft(db, project.id, 1, 2, {
      ...trimmed.payload,
      clips: trimmed.payload.clips.map((clip, index) =>
        index === 0 ? { ...clip, outMs: 9_000 } : clip
      ),
    }),
    /裁剪范围/,
  )

  const replaced = saveTimelineDraft(db, project.id, 1, 2, {
    ...trimmed.payload,
    clips: trimmed.payload.clips.map((clip, index) =>
      index === 0
        ? {
            ...clip,
            sourceAssetId: videos["shot-1-alt"].id,
            sourceDurationMs: 1,
            durationMs: 1,
            inMs: 0,
            outMs: 6_000,
            status: "ready",
            reason: null,
          }
        : clip
    ),
  })
  const replacedClip = replaced.payload.clips[0]
  assert.equal(replacedClip.sourceAssetId, videos["shot-1-alt"].id)
  assert.equal(replacedClip.sourceDurationMs, 6_000)
  assert.equal(replacedClip.durationMs, 6_000)
  assert.equal(replacedClip.status, "duration-mismatch")
  assert.match(replacedClip.reason ?? "", /视频 6.00s 与分镜 5.00s 不一致/)
  assert.equal(firstClip.sourceAssetId, videos["shot-1-current"].id)

  assert.throws(
    () => saveTimelineDraft(db, project.id, 1, 3, {
      ...replaced.payload,
      clips: replaced.payload.clips.map((clip, index) =>
        index === 0
          ? { ...clip, sourceAssetId: videos["shot-2-current"].id }
          : clip
      ),
    }),
    /无效的视频素材/,
  )
})

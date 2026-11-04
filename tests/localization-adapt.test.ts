import { test } from "node:test"
import assert from "node:assert/strict"

import { openDb } from "../lib/assets/db.ts"
import { createProject, createSnapshot, latestSnapshot } from "../lib/assets/repo.ts"
import { createLocalizationBranch } from "../lib/localization/branches.ts"
import {
  saveBranchContext,
  upsertGlossaryEntry,
} from "../lib/localization/context.ts"
import {
  buildLocalizationPrompt,
  buildLocalizationSignature,
  normalizeLocalizedEpisodes,
  saveLocalizedEpisodes,
} from "../lib/localization/adapt.ts"
import {
  loadLocalizationRun,
  saveLocalizationRun,
} from "../lib/localization/runs.ts"

const owner = `anon_${"k".repeat(48)}`

function setup() {
  const db = openDb(":memory:")
  const project = createProject(db, "改编测试", owner)
  const source = createSnapshot(db, {
    projectId: project.id,
    kind: "episodes",
    payload: [
      {
        id: "ep-1",
        number: 1,
        title: "雨夜来客",
        synopsis: "林远在旧报社发现一封没有寄件人的信。",
        hook: "信里却写着明天的日期。",
        intensity: 4,
      },
      {
        id: "ep-2",
        number: 2,
        title: "第二次死亡",
        synopsis: "林远追踪寄信人，却发现对方已经死亡。",
        hook: "死者的手机突然响起。",
        intensity: 5,
      },
    ],
  })
  const branch = createLocalizationBranch(db, project.id, owner, {
    name: "English",
    baseSnapshotId: source.id,
    market: "US",
    locale: "en-US",
  })
  const context = saveBranchContext(db, project.id, branch.id, owner, {
    marketCode: "en-US",
    platforms: ["TikTok", "ReelShort"],
    contentRating: "PG-13",
    adaptationBrief: {
      audience: "北美 25-35 女性",
      emotion: "克制但高张力",
      strategy: "保留信息差，文化梗改写成北美观众熟悉的职场压力",
      redlines: ["不出现未成年人恋爱"],
    },
  })
  upsertGlossaryEntry(db, project.id, branch.id, owner, {
    source: "林远",
    target: "Lin Yuan",
    kind: "person",
    locked: true,
  })
  return { db, project, source, branch, context }
}

test("LA1 Prompt 带市场、改编 Brief、术语和原文", () => {
  const { db, project, branch, context } = setup()
  try {
    const prompt = buildLocalizationPrompt({
      context,
      glossary: [{
        id: "g1",
        projectId: project.id,
        branchId: branch.id,
        source: "林远",
        target: "Lin Yuan",
        kind: "person",
        locked: true,
        caseSensitive: false,
        notes: "",
        createdAt: 1,
        updatedAt: 1,
      }],
      episodes: [{
        episode: 1,
        title: "雨夜来客",
        synopsis: "林远在旧报社发现一封没有寄件人的信。",
        hook: "信里却写着明天的日期。",
      }],
    })
    assert.match(prompt.system, /本地化/)
    assert.match(prompt.user, /北美 25-35 女性/)
    assert.match(prompt.user, /Lin Yuan/)
    assert.match(prompt.user, /雨夜来客/)
    assert.match(prompt.user, /TikTok/)
  } finally {
    db.close()
  }
})

test("LA2 输出整形拒绝空项，并保留来源、理由和风险", () => {
  const normalized = normalizeLocalizedEpisodes({
    items: [{
      episode: 1,
      title: "A Visitor in the Rain",
      localized: "Lin Yuan finds an unsigned letter in the old newspaper office.",
      hook: "The letter is dated tomorrow.",
      source: "林远在旧报社发现一封没有寄件人的信。",
      reason: "保留信息差，缩短西式对白长度",
      glossaryUsed: ["林远"],
      risks: ["旧报社需确认英文招牌"],
    }],
  })
  assert.equal(normalized.length, 1)
  assert.equal(normalized[0].episode, 1)
  assert.equal(normalized[0].glossaryUsed[0], "林远")
  assert.throws(
    () => normalizeLocalizedEpisodes({ items: [{ episode: 1, localized: "" }] }),
    /本地化正文/,
  )
  assert.throws(
    () => normalizeLocalizedEpisodes({ items: [{ localized: "x" }] }),
    /集数/,
  )
})

test("LA3 输入签名稳定，输入变化后不能复用旧断点", () => {
  const { db, project, source, branch } = setup()
  try {
    const base = {
      projectId: project.id,
      branchId: branch.id,
      sourceSnapshotId: source.id,
      market: "US",
    }
    const first = buildLocalizationSignature(base)
    assert.equal(buildLocalizationSignature({ ...base }), first)
    assert.notEqual(buildLocalizationSignature({ ...base, market: "LATAM" }), first)

    saveLocalizationRun(db, {
      id: "run-1",
      projectId: project.id,
      branchId: branch.id,
      ownerId: owner,
      sourceSnapshotId: source.id,
      signature: first,
      cursor: 2,
      state: { done: [1, 2] },
    })
    assert.equal(loadLocalizationRun(db, project.id, branch.id, first)?.cursor, 2)
    assert.equal(loadLocalizationRun(db, project.id, branch.id, "different"), null)
  } finally {
    db.close()
  }
})

test("LA4 确认后只写当前海外分支快照，原始版本不变", () => {
  const { db, project, source, branch } = setup()
  try {
    const localized = normalizeLocalizedEpisodes({
      items: [
        {
          episode: 1,
          title: "A Visitor in the Rain",
          localized: "Lin Yuan finds an unsigned letter.",
          hook: "The letter is dated tomorrow.",
          source: "林远在旧报社发现一封没有寄件人的信。",
          reason: "缩短句子以适配字幕",
          risks: [],
          glossaryUsed: ["林远"],
        },
        {
          episode: 2,
          title: "The Second Death",
          localized: "Lin Yuan tracks the sender and learns she is already dead.",
          hook: "Her phone suddenly rings.",
          source: "林远追踪寄信人，却发现对方已经死亡。",
          reason: "保留悬念",
          risks: [],
          glossaryUsed: ["林远"],
        },
      ],
    })
    const snapshot = saveLocalizedEpisodes(
      db,
      project.id,
      branch.id,
      owner,
      source.id,
      localized,
      999,
    )
    assert.equal(snapshot.branchId, branch.id)
    assert.deepEqual(snapshot.parents, [source.id])
    const originalPayload = latestSnapshot(db, project.id, "episodes")?.payload as Array<{ title: string }>
    const localizedPayload = latestSnapshot(db, project.id, "episodes", branch.id)
      ?.payload as Array<{ title: string }>
    assert.equal(originalPayload[0].title, "雨夜来客")
    assert.equal(localizedPayload[0].title, "A Visitor in the Rain")
  } finally {
    db.close()
  }
})

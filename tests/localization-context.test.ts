import { test } from "node:test"
import assert from "node:assert/strict"

import { createCanonFact } from "../lib/assets/canon.ts"
import { openDb } from "../lib/assets/db.ts"
import { createProject, createSnapshot } from "../lib/assets/repo.ts"
import { createLocalizationBranch } from "../lib/localization/branches.ts"
import {
  getBranchCanon,
  createBranchCanonFact,
  listGlossary,
  getBranchContext,
  MARKET_PROFILES,
  saveBranchContext,
  upsertGlossaryEntry,
} from "../lib/localization/context.ts"

const owner = `anon_${"j".repeat(48)}`

function setup() {
  const db = openDb(":memory:")
  const project = createProject(db, "本地化上下文", owner)
  const snapshot = createSnapshot(db, {
    projectId: project.id,
    kind: "episodes",
    payload: [{ id: "ep-1", number: 1, title: "原版" }],
  })
  const branch = createLocalizationBranch(db, project.id, owner, {
    name: "English",
    baseSnapshotId: snapshot.id,
    market: "US",
    locale: "en-US",
  })
  return { db, project, snapshot, branch }
}

test("LC1 内置三个市场 Profile，并保存分支上下文", () => {
  assert.deepEqual(MARKET_PROFILES.map((profile) => profile.locale), [
    "en-US",
    "es-419",
    "id-ID",
  ])
  const { db, project, branch } = setup()
  try {
    assert.equal(getBranchContext(db, project.id, branch.id, owner), null)
    const context = saveBranchContext(db, project.id, branch.id, owner, {
      marketCode: "en-US",
      platforms: ["TikTok", "ReelShort"],
      contentRating: "PG-13",
      adaptationBrief: {
        audience: "北美 25-35 女性",
        emotion: "克制但高张力",
        strategy: "保留冲突，改写文化梗和称谓",
        redlines: ["不涉及未成年人恋爱"],
      },
      subtitle: {
        maxLineChars: 42,
        maxCps: 17,
      },
    }, 100)
    assert.equal(context.version, 1)
    assert.equal(context.profile.locale, "en-US")
    assert.equal(context.platforms.length, 2)
    assert.equal(context.subtitle.maxLineChars, 42)

    const next = saveBranchContext(db, project.id, branch.id, owner, {
      ...context,
      version: 1,
      contentRating: "R",
    }, 200)
    assert.equal(next.version, 2)
    assert.equal(next.contentRating, "R")

    assert.throws(
      () => saveBranchContext(db, project.id, branch.id, owner, {
        marketCode: "en-US",
        version: 1,
      }),
      /其他设备|版本/,
    )
    assert.throws(
      () => saveBranchContext(db, project.id, branch.id, owner, {
        marketCode: "unknown",
      }),
      /市场/,
    )
  } finally {
    db.close()
  }
})

test("LC2 Localization Bible 按 source 去重，并锁定人物译名", () => {
  const { db, project, branch } = setup()
  try {
    const first = upsertGlossaryEntry(db, project.id, branch.id, owner, {
      source: "林远",
      target: "Lin Yuan",
      kind: "person",
      locked: true,
    }, 100)
    assert.equal(first.source, "林远")
    assert.equal(first.locked, true)

    const updated = upsertGlossaryEntry(db, project.id, branch.id, owner, {
      source: "林远",
      target: "Lin Yuan",
      kind: "person",
      locked: true,
      notes: "全剧统一译名",
    }, 200)
    assert.equal(updated.id, first.id)
    assert.equal(updated.notes, "全剧统一译名")
    assert.equal(listGlossary(db, project.id, branch.id, owner).length, 1)
    assert.throws(
      () => upsertGlossaryEntry(db, project.id, branch.id, owner, {
        source: " ",
        target: "x",
      }),
      /原文/,
    )
    assert.throws(
      () => upsertGlossaryEntry(db, project.id, branch.id, owner, {
        source: "林远",
        target: " ",
      }),
      /译法/,
    )
  } finally {
    db.close()
  }
})

test("LC3 分支 Canon 继承全球事实，并能记录市场覆盖", () => {
  const { db, project, branch } = setup()
  try {
    createCanonFact(db, project.id, {
      kind: "character",
      name: "林远",
      field: "occupation",
      value: "调查记者",
      validFromEpisode: 1,
      validToEpisode: 30,
      locked: true,
    }, 100)
    const override = createBranchCanonFact(db, project.id, branch.id, owner, {
      kind: "character",
      name: "林远",
      field: "occupation",
      value: "investigative journalist",
      validFromEpisode: 1,
      validToEpisode: 30,
    }, 200)
    assert.equal(override.branchId, branch.id)
    assert.equal(override.value, "investigative journalist")

    const canon = getBranchCanon(db, project.id, branch.id, owner)
    assert.equal(canon.entities.length, 1)
    assert.equal(canon.facts.length, 1)
    assert.equal(canon.issues.some((issue) => issue.code === "branch-override"), true)
  } finally {
    db.close()
  }
})

import { test } from "node:test"
import assert from "node:assert/strict"

import { openDb } from "../lib/assets/db.ts"
import { createProject, createSnapshot } from "../lib/assets/repo.ts"
import { createLocalizationBranch } from "../lib/localization/branches.ts"
import {
  saveBranchContext,
  upsertGlossaryEntry,
} from "../lib/localization/context.ts"
import {
  auditLocalization,
  getLatestLocalizationAudit,
  saveLocalizationAudit,
} from "../lib/localization/audit.ts"

const owner = `anon_${"m".repeat(48)}`

function setup() {
  const db = openDb(":memory:")
  const project = createProject(db, "审计测试", owner)
  const source = createSnapshot(db, {
    projectId: project.id,
    kind: "episodes",
    payload: [{ id: "ep-1", number: 1, title: "原版", synopsis: "林远走进旧报社。", hook: "电话响了。" }],
  })
  const branch = createLocalizationBranch(db, project.id, owner, {
    name: "English",
    baseSnapshotId: source.id,
    market: "US",
    locale: "en-US",
  })
  const context = saveBranchContext(db, project.id, branch.id, owner, {
    marketCode: "en-US",
    adaptationBrief: {
      redlines: ["underage romance"],
    },
    subtitle: {
      maxLineChars: 42,
      maxCps: 17,
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

test("AU1 锁定术语缺失产生 blocking，并定位到集数", () => {
  const { db, project, branch, context } = setup()
  try {
    const report = auditLocalization({
      projectId: project.id,
      branchId: branch.id,
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
      items: [{
        episode: 1,
        title: "The Office",
        localized: "Lin enters the old newspaper office.",
        hook: "The phone rings.",
        source: "林远走进旧报社。",
        reason: "缩短字幕",
        glossaryUsed: [],
        risks: [],
      }],
    })
    assert.ok(report.issues.some((issue) =>
      issue.code === "glossary-miss"
      && issue.severity === "blocking"
      && issue.episode === 1
    ))
  } finally {
    db.close()
  }
})

test("AU2 字幕超长产生 warning，红线命中产生 blocking", () => {
  const { db, project, branch, context } = setup()
  try {
    const report = auditLocalization({
      projectId: project.id,
      branchId: branch.id,
      context,
      glossary: [],
      items: [{
        episode: 1,
        title: "Forbidden",
        localized: "This line contains underage romance and it is also much longer than the configured subtitle limit.",
        hook: "Lin Yuan arrives.",
        source: "林远到达。",
        reason: "测试",
        glossaryUsed: [],
        risks: [],
      }],
    })
    assert.ok(report.issues.some((issue) => issue.code === "subtitle-too-long"))
    assert.ok(report.issues.some((issue) =>
      issue.code === "banned-expression" && issue.severity === "blocking"
    ))
  } finally {
    db.close()
  }
})

test("AU3 无问题时 blocking=0，并可保存、读取最新审计", () => {
  const { db, project, source, branch, context } = setup()
  try {
    const report = auditLocalization({
      projectId: project.id,
      branchId: branch.id,
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
      items: [{
        episode: 1,
        title: "The Office",
        localized: "Lin Yuan enters.",
        hook: "The phone rings.",
        source: "林远走进旧报社。",
        reason: "简短句适配字幕",
        glossaryUsed: ["林远"],
        risks: [],
      }],
    })
    assert.equal(report.blocking, 0)
    const saved = saveLocalizationAudit(db, project.id, branch.id, owner, source.id, report, 100)
    assert.equal(saved.blocking, 0)
    assert.equal(getLatestLocalizationAudit(db, project.id, branch.id, owner)?.id, saved.id)
  } finally {
    db.close()
  }
})

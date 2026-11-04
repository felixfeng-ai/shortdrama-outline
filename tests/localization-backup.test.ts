import { test } from "node:test"
import assert from "node:assert/strict"

import { openDb } from "../lib/assets/db.ts"
import { createCanonFact } from "../lib/assets/canon.ts"
import { createProject, createSnapshot, latestSnapshot } from "../lib/assets/repo.ts"
import { createLocalizationBranch } from "../lib/localization/branches.ts"
import {
  createBranchCanonFact,
  saveBranchContext,
  upsertGlossaryEntry,
} from "../lib/localization/context.ts"
import {
  exportLocalizationBackup,
  restoreLocalizationBackup,
} from "../lib/localization/backup.ts"
import { auditLocalization, saveLocalizationAudit } from "../lib/localization/audit.ts"

const owner = `anon_${"s".repeat(48)}`

test("LB1 完整备份可导出海外分支并恢复到新项目", () => {
  const db = openDb(":memory:")
  try {
    const sourceProject = createProject(db, "原项目", owner)
    const source = createSnapshot(db, {
      projectId: sourceProject.id,
      kind: "episodes",
      payload: [{ id: "ep-1", number: 1, title: "原版", synopsis: "林远到达。", hook: "电话响了。" }],
    })
    const branch = createLocalizationBranch(db, sourceProject.id, owner, {
      name: "English",
      baseSnapshotId: source.id,
      market: "US",
      locale: "en-US",
    })
    const context = saveBranchContext(db, sourceProject.id, branch.id, owner, {
      marketCode: "en-US",
      adaptationBrief: { audience: "US women 25-35" },
    })
    upsertGlossaryEntry(db, sourceProject.id, branch.id, owner, {
      source: "林远",
      target: "Lin Yuan",
      locked: true,
    })
    createCanonFact(db, sourceProject.id, {
      kind: "character",
      name: "林远",
      field: "occupation",
      value: "记者",
      validFromEpisode: 1,
      validToEpisode: 30,
    })
    createBranchCanonFact(db, sourceProject.id, branch.id, owner, {
      kind: "character",
      name: "林远",
      field: "preferredName",
      value: "Lin Yuan",
      validFromEpisode: 1,
      validToEpisode: 30,
    })
    const localized = createSnapshot(db, {
      projectId: sourceProject.id,
      branchId: branch.id,
      kind: "episodes",
      payload: [{ id: "ep-1", number: 1, title: "Arrival", synopsis: "Lin Yuan arrives.", hook: "The phone rings." }],
      parents: [source.id],
    })
    const report = auditLocalization({
      projectId: sourceProject.id,
      branchId: branch.id,
      context,
      glossary: [],
      items: [{
        episode: 1,
        title: "Arrival",
        localized: "Lin Yuan arrives.",
        hook: "The phone rings.",
        source: "林远到达。",
        reason: "短句",
        glossaryUsed: [],
        risks: [],
      }],
    })
    saveLocalizationAudit(
      db,
      sourceProject.id,
      branch.id,
      owner,
      localized.id,
      report,
    )

    const backup = exportLocalizationBackup(db, sourceProject.id, owner)
    assert.equal(backup.branches.length, 1)
    assert.equal(backup.contexts.length, 1)
    assert.equal(backup.glossary.length, 1)
    assert.equal(backup.canonFacts.length, 1)
    assert.equal(backup.audits.length, 1)
    assert.equal(backup.snapshots.length, 1)

    const targetProject = createProject(db, "恢复项目", owner)
    const baseSnapshotMap = new Map<string, string>()
    const restoredSource = createSnapshot(db, {
      projectId: targetProject.id,
      kind: "episodes",
      payload: source.payload,
    })
    baseSnapshotMap.set(source.id, restoredSource.id)
    const result = restoreLocalizationBackup(
      db,
      targetProject.id,
      owner,
      backup,
      { sourceSnapshotId: restoredSource.id },
    )
    assert.equal(result.branches, 1)
    assert.equal(result.snapshots, 1)
    assert.equal(
      latestSnapshot(db, targetProject.id, "episodes", result.branchIdMap.get(branch.id))?.branchId,
      result.branchIdMap.get(branch.id),
    )
  } finally {
    db.close()
  }
})

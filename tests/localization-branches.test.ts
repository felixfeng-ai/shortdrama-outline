import { test } from "node:test"
import assert from "node:assert/strict"

import { openDb } from "../lib/assets/db.ts"
import {
  createProject,
  createSnapshot,
  latestSnapshot,
  listSnapshots,
} from "../lib/assets/repo.ts"
import {
  createLocalizationBranch,
  getLocalizationBranch,
  listLocalizationBranches,
} from "../lib/localization/branches.ts"

const owner = `anon_${"g".repeat(48)}`
const otherOwner = `anon_${"h".repeat(48)}`

test("LOC1 旧快照保持原始版本，并可按 branchId 隔离海外快照", () => {
  const db = openDb(":memory:")
  try {
    const project = createProject(db, "出海测试", owner)
    const source = createSnapshot(db, {
      projectId: project.id,
      kind: "episodes",
      payload: [{ id: "ep-1", number: 1, title: "原版第一集" }],
    })
    assert.equal(source.branchId, "")

    const branch = createLocalizationBranch(db, project.id, owner, {
      name: "English",
      baseSnapshotId: source.id,
      market: "US",
      locale: "en-US",
      sourceLanguage: "zh-CN",
    }, 100)
    assert.equal(branch.branchType, "localization")
    assert.equal(branch.locale, "en-US")
    assert.equal(branch.market, "US")

    const localized = createSnapshot(db, {
      projectId: project.id,
      branchId: branch.id,
      kind: "episodes",
      payload: [{ id: "ep-1", number: 1, title: "The First Night" }],
      parents: [source.id],
    })
    assert.equal(localized.branchId, branch.id)
    assert.equal(listSnapshots(db, project.id, "episodes").length, 1)
    assert.equal(listSnapshots(db, project.id, "episodes", branch.id).length, 1)
    assert.equal(latestSnapshot(db, project.id, "episodes")?.branchId, "")
    const localizedPayload = latestSnapshot(db, project.id, "episodes", branch.id)
      ?.payload as Array<{ title: string }>
    assert.equal(localizedPayload[0].title, "The First Night")
    assert.deepEqual(localized.parents, [source.id])
  } finally {
    db.close()
  }
})

test("LOC2 海外分支按 owner 隔离，且不能引用其它项目快照", () => {
  const db = openDb(":memory:")
  try {
    const project = createProject(db, "分支权限", owner)
    const otherProject = createProject(db, "其它项目", owner)
    const source = createSnapshot(db, {
      projectId: project.id,
      kind: "characters",
      payload: [{ id: "char-1", name: "林远" }],
    })
    const foreign = createSnapshot(db, {
      projectId: otherProject.id,
      kind: "characters",
      payload: [{ id: "char-x", name: "别人" }],
    })
    const branch = createLocalizationBranch(db, project.id, owner, {
      name: "Spanish",
      baseSnapshotId: source.id,
      market: "LATAM",
      locale: "es-419",
    })

    assert.equal(getLocalizationBranch(db, project.id, branch.id, owner)?.locale, "es-419")
    assert.equal(getLocalizationBranch(db, project.id, branch.id, otherOwner), null)
    assert.equal(listLocalizationBranches(db, project.id, owner).length, 1)

    assert.throws(
      () => createLocalizationBranch(db, project.id, owner, {
        name: "错误分支",
        baseSnapshotId: foreign.id,
        market: "US",
        locale: "en-US",
      }),
      /基线快照/,
    )
  } finally {
    db.close()
  }
})

test("LOC3 迁移 v9 增加分支字段，但不要求旧调用传 branchId", () => {
  const db = openDb(":memory:")
  try {
    const migration = db.prepare(
      "SELECT name FROM schema_migrations WHERE version = 9",
    ).get() as { name: string } | undefined
    assert.equal(migration?.name, "short-drama-localization")
    const snapshotColumns = db.prepare("PRAGMA table_info(snapshots)").all() as { name: string }[]
    assert.ok(snapshotColumns.some((column) => column.name === "branch_id"))
    const branchColumns = db.prepare("PRAGMA table_info(project_branches)").all() as { name: string }[]
    assert.ok(branchColumns.some((column) => column.name === "branch_type"))
    assert.ok(branchColumns.some((column) => column.name === "locale"))
  } finally {
    db.close()
  }
})

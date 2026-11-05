import { test } from "node:test"
import assert from "node:assert/strict"

import { openDb } from "../lib/assets/db.ts"

test("P1-V5 时间线迁移创建草稿、版本和唯一约束", () => {
  const db = openDb(":memory:")
  const tables = db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('timeline_drafts', 'timeline_versions') ORDER BY name",
  ).all() as Array<{ name: string }>
  assert.deepEqual(tables.map((row) => row.name), ["timeline_drafts", "timeline_versions"])
  const migration = db.prepare(
    "SELECT version, name FROM schema_migrations WHERE version = 14",
  ).get() as { version: number; name: string } | undefined
  assert.equal(migration?.name, "episode-timelines")
  db.close()
})

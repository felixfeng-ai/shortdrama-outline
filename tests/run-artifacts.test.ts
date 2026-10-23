import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"

import { getDataDir } from "../lib/assets/db.ts"
import { cleanupSuiteArtifacts } from "./run-artifacts.mjs"

test("测试套件结束后只清理测试数据库与本轮生成目录", () => {
  const tmpRoot = path.join(getDataDir(), "tmp")
  fs.mkdirSync(tmpRoot, { recursive: true })
  const suiteRoot = fs.mkdtempSync(path.join(tmpRoot, "test-run-cleanup-"))
  const tmp = path.join(suiteRoot, "tmp")
  fs.mkdirSync(path.join(tmp, "generated-123"), { recursive: true })
  fs.mkdirSync(path.join(tmp, "test-isolation-456"), { recursive: true })
  fs.writeFileSync(path.join(tmp, "test-a1-123-456.db"), "db")
  fs.writeFileSync(path.join(tmp, "t-a2-123-456.db-wal"), "wal")
  fs.writeFileSync(path.join(tmp, "keep.db"), "keep")

  try {
    cleanupSuiteArtifacts(suiteRoot)

    assert.equal(fs.existsSync(path.join(tmp, "generated-123")), false)
    assert.equal(fs.existsSync(path.join(tmp, "test-isolation-456")), false)
    assert.equal(fs.existsSync(path.join(tmp, "test-a1-123-456.db")), false)
    assert.equal(fs.existsSync(path.join(tmp, "t-a2-123-456.db-wal")), false)
    assert.equal(fs.existsSync(path.join(tmp, "keep.db")), true)
  } finally {
    fs.rmSync(suiteRoot, { recursive: true, force: true })
  }
})

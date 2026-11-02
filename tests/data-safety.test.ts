import { test } from "node:test"
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { openDb } from "../lib/assets/db.ts"
import {
  createDataBackup,
  pruneDataBackups,
  restoreDataBackup,
  verifyDataBackup,
} from "../lib/ops/backup.mjs"

function tempRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "chengju-data-safety-"))
}

function createFixture(root: string): string {
  const dataDir = path.join(root, "data")
  fs.mkdirSync(path.join(dataDir, "generated", "project-1"), { recursive: true })
  fs.writeFileSync(path.join(dataDir, "generated", "project-1", "frame.png"), Buffer.from([1, 3, 5, 7]))
  const db = openDb(path.join(dataDir, "chengju.db"))
  try {
    db.prepare(
      "INSERT INTO projects (id, title, owner_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    ).run("project-1", "备份项目", "owner-1", 100, 100)
  } finally {
    db.close()
  }
  return dataDir
}

test("D1 SQLite 写入等待为 5 秒", () => {
  const db = openDb(":memory:")
  try {
    const row = db.prepare("PRAGMA busy_timeout").get() as { timeout: number }
    assert.equal(Number(row.timeout), 5000)
  } finally {
    db.close()
  }
})

test("D2 备份包含一致性数据库、图片和可校验 manifest", () => {
  const root = tempRoot()
  try {
    const dataDir = createFixture(root)
    const backupRoot = path.join(root, "backups")
    const created = createDataBackup({
      dataDir,
      backupRoot,
      keep: 7,
      now: new Date("2026-10-28T01:02:03.456Z"),
      appVersion: "test-version",
    })
    assert.equal(fs.existsSync(path.join(created.directory, "chengju.db")), true)
    assert.equal(
      fs.readFileSync(path.join(created.directory, "generated", "project-1", "frame.png"))
        .equals(Buffer.from([1, 3, 5, 7])),
      true,
    )
    const manifest = JSON.parse(
      fs.readFileSync(path.join(created.directory, "manifest.json"), "utf8"),
    ) as { appVersion: string; dbSha256: string; generatedFiles: number }
    assert.equal(manifest.appVersion, "test-version")
    assert.equal(manifest.generatedFiles, 1)
    assert.match(manifest.dbSha256, /^[a-f0-9]{64}$/)
    assert.deepEqual(verifyDataBackup(created.directory), {
      dbSha256: manifest.dbSha256,
      generatedFiles: 1,
    })
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test("D3 恢复只写入新目录，并校验确认参数", () => {
  const root = tempRoot()
  try {
    const dataDir = createFixture(root)
    const backup = createDataBackup({
      dataDir,
      backupRoot: path.join(root, "backups"),
      keep: 7,
    })
    const target = path.join(root, "restored")
    assert.throws(
      () => restoreDataBackup({ backupDir: backup.directory, targetDir: target }),
      /确认/,
    )
    restoreDataBackup({ backupDir: backup.directory, targetDir: target, confirm: true })
    const db = openDb(path.join(target, "chengju.db"))
    try {
      const row = db.prepare("SELECT title FROM projects WHERE id = ?").get("project-1") as { title: string }
      assert.equal(row.title, "备份项目")
    } finally {
      db.close()
    }
    assert.equal(
      fs.readFileSync(path.join(target, "generated", "project-1", "frame.png"))
        .equals(Buffer.from([1, 3, 5, 7])),
      true,
    )
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test("D4 数据库或图片被篡改时恢复拒绝执行", () => {
  const root = tempRoot()
  try {
    const dataDir = createFixture(root)
    const backup = createDataBackup({
      dataDir,
      backupRoot: path.join(root, "backups"),
      keep: 7,
    })
    fs.writeFileSync(path.join(backup.directory, "generated", "project-1", "frame.png"), "changed")
    assert.throws(() => verifyDataBackup(backup.directory), /校验失败/)
    assert.throws(
      () => restoreDataBackup({
        backupDir: backup.directory,
        targetDir: path.join(root, "restored"),
        confirm: true,
      }),
      /校验失败/,
    )
    assert.equal(fs.existsSync(path.join(root, "restored")), false)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test("D5 只保留最近 N 份有效备份", () => {
  const root = tempRoot()
  try {
    const dataDir = createFixture(root)
    const backupRoot = path.join(root, "backups")
    for (let i = 0; i < 3; i += 1) {
      createDataBackup({
        dataDir,
        backupRoot,
        keep: 2,
        now: new Date(`2026-10-2${i + 1}T00:00:00.000Z`),
      })
    }
    assert.equal(pruneDataBackups(backupRoot, 2), 0)
    const entries = fs.readdirSync(backupRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
    assert.equal(entries.length, 2)
    assert.equal(fs.existsSync(path.join(backupRoot, "20261021-000000-000")), false)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test("D6 备份与恢复 CLI 可独立运行", () => {
  const root = tempRoot()
  try {
    const dataDir = createFixture(root)
    const backupRoot = path.join(root, "cli-backups")
    const env = {
      ...process.env,
      CHENGJU_DATA_DIR: dataDir,
      CHENGJU_BACKUP_DIR: backupRoot,
      CHENGJU_BACKUP_KEEP: "7",
    }
    const backupRun = spawnSync(process.execPath, ["scripts/backup-data.mjs"], {
      cwd: process.cwd(),
      env,
      encoding: "utf8",
    })
    assert.equal(backupRun.status, 0, backupRun.stderr)
    const backupDir = fs.readdirSync(backupRoot).map((name) =>
      path.join(backupRoot, name)
    )[0]
    const target = path.join(root, "cli-restored")
    const refused = spawnSync(
      process.execPath,
      ["scripts/restore-data.mjs", backupDir, target],
      { cwd: process.cwd(), env, encoding: "utf8" },
    )
    assert.notEqual(refused.status, 0)
    assert.match(refused.stderr, /CHENGJU_RESTORE_CONFIRM/)

    const restored = spawnSync(
      process.execPath,
      ["scripts/restore-data.mjs", backupDir, target],
      {
        cwd: process.cwd(),
        env: { ...env, CHENGJU_RESTORE_CONFIRM: "1" },
        encoding: "utf8",
      },
    )
    assert.equal(restored.status, 0, restored.stderr)
    assert.equal(fs.existsSync(path.join(target, "chengju.db")), true)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test("D7 生产部署在构建前执行完整备份", () => {
  const deploy = fs.readFileSync("deploy/cicd-deploy.sh", "utf8")
  const backupAt = deploy.indexOf("scripts/backup-data.mjs")
  const buildAt = deploy.indexOf("npm run build")
  assert.ok(backupAt >= 0, "部署脚本没有调用完整备份")
  assert.ok(buildAt > backupAt, "完整备份必须在生产构建之前执行")
})

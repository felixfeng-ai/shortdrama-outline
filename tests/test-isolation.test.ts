import { test } from "node:test"
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"

import { getDataDir } from "../lib/assets/db.ts"

test("测试进程退出只清理自己的生成目录，不删除并行进程产物", () => {
  const tmpRoot = path.join(getDataDir(), "tmp")
  fs.mkdirSync(tmpRoot, { recursive: true })
  const isolatedDataDir = fs.mkdtempSync(path.join(tmpRoot, "test-isolation-"))
  const manifestPath = path.join(isolatedDataDir, "child-paths.json")
  const registerPath = pathToFileURL(path.resolve("tests/register.mjs")).href
  const cleanupPath = pathToFileURL(path.resolve("tests/cleanup.mjs")).href
  const childCode = `
    const fs = require("node:fs")
    const path = require("node:path")
    const ownDir = process.env.CHENGJU_GENERATED_DIR
    const siblingDir = path.join(path.dirname(ownDir), "generated-" + (process.pid + 1))
    fs.mkdirSync(ownDir, { recursive: true })
    fs.writeFileSync(path.join(ownDir, "own.png"), "own")
    fs.mkdirSync(siblingDir, { recursive: true })
    fs.writeFileSync(path.join(siblingDir, "other.png"), "other")
    fs.writeFileSync(
      process.env.CHENGJU_DATA_DIR + "/child-paths.json",
      JSON.stringify({ ownDir, siblingDir }),
    )
  `

  try {
    const child = spawnSync(
      process.execPath,
      ["--import", registerPath, "--import", cleanupPath, "--eval", childCode],
      {
        env: { ...process.env, CHENGJU_DATA_DIR: isolatedDataDir },
        encoding: "utf8",
      },
    )

    assert.equal(child.status, 0, child.stderr)
    const paths = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
      ownDir: string
      siblingDir: string
    }
    assert.equal(fs.existsSync(paths.ownDir), false)
    assert.equal(fs.existsSync(path.join(paths.siblingDir, "other.png")), true)
  } finally {
    fs.rmSync(isolatedDataDir, { recursive: true, force: true })
  }
})

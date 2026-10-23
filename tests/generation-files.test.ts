import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"

import { getDataDir } from "../lib/assets/db.ts"
import {
  readGeneratedImage,
  removeGeneratedProjectFiles,
  resolveGeneratedStoragePath,
  writeGeneratedImage,
} from "../lib/generation/files.ts"

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])

test("G2.2 生成图片落在项目目录，数据库只拿到相对 storageKey", () => {
  const projectId = `project-${process.pid}-${Date.now()}`
  const assetId = "asset-1"
  const saved = writeGeneratedImage(projectId, assetId, PNG, "image/png")

  assert.equal(saved.storageKey, `generated/${projectId}/${assetId}.png`)
  assert.equal(saved.bytes, PNG.length)
  const full = resolveGeneratedStoragePath(saved.storageKey)
  const generatedRoot = process.env.CHENGJU_GENERATED_DIR || path.join(getDataDir(), "generated")
  assert.ok(full.startsWith(path.join(generatedRoot, projectId)))
  assert.deepEqual(new Uint8Array(fs.readFileSync(full)), PNG)

  removeGeneratedProjectFiles(projectId)
  assert.equal(fs.existsSync(full), false)
})

test("G3.3 读取路径拒绝目录穿越与绝对路径", () => {
  assert.throws(() => resolveGeneratedStoragePath("../secrets.png"), /路径非法/)
  assert.throws(() => resolveGeneratedStoragePath("generated/../../secrets.png"), /路径非法/)
  assert.throws(() => resolveGeneratedStoragePath("/etc/passwd"), /路径非法/)
})

test("G2.3 已记录但文件缺失时返回可读错误", () => {
  assert.throws(
    () => readGeneratedImage(`generated/missing-project/${Date.now()}.png`),
    /关键帧文件不存在/,
  )
})

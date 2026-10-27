import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

import { buildProjectPackageManifest } from "../lib/assets/export.ts"
import {
  keyframeExportName,
  keyframeManifestEntry,
} from "../lib/generation/export.ts"
import type { GeneratedAsset } from "../lib/generation/types.ts"

const asset: GeneratedAsset = {
  id: "asset-1",
  taskId: "task-1",
  projectId: "project-1",
  targetType: "character",
  targetId: "character/unsafe id",
  storageKey: "generated/project-1/asset-1.png",
  mime: "image/png",
  bytes: 128,
  providerId: "openai",
  model: "gpt-image-1",
  prompt: "character portrait",
  selectedAt: 123,
  createdAt: 100,
  downloadUrl: "/api/generated-assets/asset-1",
}

test("G7.1 单独下载文件名只含安全字符与正确扩展名", () => {
  assert.equal(keyframeExportName(asset), "character-character-unsafe-id-asset-1.png")
  assert.equal(keyframeExportName({ ...asset, mime: "image/jpeg" }), "character-character-unsafe-id-asset-1.jpg")
  assert.equal(keyframeExportName({ ...asset, mime: "image/webp" }), "character-character-unsafe-id-asset-1.webp")
})

test("G7.2 manifest 保留关键帧元数据，但不泄露服务器 storageKey", () => {
  const manifest = buildProjectPackageManifest({
    project: { id: "project-1", title: "测试" },
    mode: "delivery",
    exportedAt: 999,
    projectSettings: {
      genre: "none",
      episodeCount: 0,
      brief: { emotion: "", audience: "", references: "", redline: "" },
      look: { palette: "", light: "", lens: "", banned: "" },
      judgments: [],
    },
    story: {},
    assets: {},
    refs: [],
    keyframes: [keyframeManifestEntry(asset)],
  })

  assert.equal(manifest.keyframes.length, 1)
  assert.equal(manifest.schemaVersion, 2)
  assert.equal(manifest.keyframes[0].id, "asset-1")
  assert.equal("storageKey" in manifest.keyframes[0], false)
  assert.equal(manifest.keyframes[0].selectedAt, 123)
})

test("G7.2/G7.3 页面导出会拉取关键帧、写入 manifest 并只打包已采用版本", () => {
  const page = fs.readFileSync("app/page.tsx", "utf8")
  const client = fs.readFileSync("lib/generation/client.ts", "utf8")
  const panel = fs.readFileSync("components/KeyframePanel.tsx", "utf8")

  assert.ok(client.includes("fetchProjectGenerationAssets"), "缺少项目级关键帧拉取")
  assert.ok(page.includes("fetchProjectGenerationAssets"), "导出流程没有读取关键帧")
  assert.ok(page.includes("keyframes:"), "project.json 没有写入关键帧元数据")
  assert.ok(page.includes("generated/selected/"), "ZIP 没有采用图目录")
  assert.ok(page.includes("generated/history/"), "完整备份没有历史候选目录")
  assert.ok(page.includes("selectedAt"), "ZIP 没有按采用状态筛选")
  assert.ok(panel.includes("下载关键帧"), "关键帧卡缺少单独下载入口")
})

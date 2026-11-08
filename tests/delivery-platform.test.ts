import { test } from "node:test"
import assert from "node:assert/strict"

import {
  buildPublishMetadata,
  deliveryPlatformProfile,
  validatePublishReadiness,
} from "../lib/delivery/platforms.ts"

test("DELIVERY-PLATFORM1 平台规格覆盖国内外竖横屏目标", () => {
  assert.equal(deliveryPlatformProfile("douyin").ratio, "9:16")
  assert.equal(deliveryPlatformProfile("reels").ratio, "9:16")
  assert.equal(deliveryPlatformProfile("bilibili").ratio, "16:9")
  assert.equal(deliveryPlatformProfile("youtube").ratio, "16:9")
})

test("DELIVERY-PLATFORM2 发布元数据来自真实项目且默认带 AI 声明", () => {
  const metadata = buildPublishMetadata({
    projectTitle: "快递员的最后一单",
    episode: 3,
    episodeTitle: "门后的真相",
    durationMs: 7_000,
    width: 1080,
    height: 1920,
    sizeBytes: 4_000_000,
    subtitleMode: "burned",
    coverAvailable: true,
  })
  assert.match(metadata.title, /快递员的最后一单/)
  assert.match(metadata.title, /第 3 集/)
  assert.match(metadata.description, /门后的真相/)
  assert.match(metadata.aiDisclosure, /人工智能/)
  assert.ok(metadata.hashtags.includes("AI短剧"))
  assert.equal(metadata.resolution, "1080x1920")
})

test("DELIVERY-PLATFORM3 发布预检拒绝错误画幅和未烧录字幕", () => {
  const metadata = buildPublishMetadata({
    projectTitle: "测试项目",
    episode: 1,
    durationMs: 7_000,
    width: 1080,
    height: 1920,
    sizeBytes: 4_000_000,
    subtitleMode: "sidecar",
    coverAvailable: false,
  })
  const result = validatePublishReadiness(
    deliveryPlatformProfile("douyin"),
    metadata,
  )
  assert.equal(result.ready, false)
  assert.ok(result.issues.some((issue) => issue.code === "cover-missing"))
  assert.ok(result.issues.some((issue) => issue.code === "subtitle-not-burned"))
})


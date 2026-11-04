import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import type { Shot } from "../lib/assets/types.ts"
import {
  PLATFORM_EXPORT_TARGETS,
  buildPlatformExportKit,
  platformProfile,
  preflightPlatformExport,
} from "../lib/export/platforms.ts"

function shot(over: Partial<Shot> = {}): Shot {
  return {
    id: "shot-row-1",
    entityId: "shot-1",
    shot: 1,
    episode: 1,
    scene: "雨夜楼道",
    characters: [],
    action: "陈默敲门",
    speaker: "",
    dialogue: "",
    place: "旧楼",
    shotSize: "中景",
    camera: "固定",
    prompt: "cinematic still, a delivery man knocking on an old apartment door in heavy rain",
    refImages: [],
    missingRefFor: [],
    params: { ratio: "9:16", duration: 10, lastFrame: false },
    status: "todo",
    ...over,
  }
}

test("PAD1 五个目标各有独立 Profile 和操作说明", () => {
  const profiles = PLATFORM_EXPORT_TARGETS.map((target) => platformProfile(target))
  assert.equal(profiles.length, 5)
  assert.equal(new Set(profiles.map((profile) => profile.mode)).size >= 4, true)
  for (const profile of profiles) {
    assert.equal(profile.label.length > 0, true)
    assert.ok(profile.summary.length > 8)
    assert.ok(profile.steps.length >= 2)
  }
  assert.equal(platformProfile("jimeng").requiresKeyframe, true)
  assert.equal(platformProfile("kling").requiresKeyframe, true)
  assert.equal(platformProfile("json").requiresKeyframe, false)
})

test("PAD2 空提示词是阻断项，原始提示词内容不被改写", () => {
  const input = [shot({ prompt: "   " })]
  const before = JSON.stringify(input)
  const preflight = preflightPlatformExport(input, {
    target: "jimeng",
    keyframePathByTargetId: { "shot-1": "generated/selected/shot.png" },
  })
  assert.equal(preflight.blocking, 1)
  assert.ok(preflight.issues.some((issue) => issue.code === "missing-prompt"))
  assert.equal(JSON.stringify(input), before)
})

test("PAD3 只有提供真实采用图清单时才判断缺首帧", () => {
  const withoutMap = preflightPlatformExport([shot()], { target: "jimeng" })
  assert.equal(withoutMap.issues.some((issue) => issue.code === "missing-keyframe"), false)

  const withMap = preflightPlatformExport([shot()], {
    target: "jimeng",
    keyframePathByTargetId: {},
  })
  assert.ok(withMap.issues.some((issue) =>
    issue.code === "missing-keyframe" && issue.severity === "warning"
  ))

  const general = preflightPlatformExport([shot()], {
    target: "general",
    keyframePathByTargetId: {},
  })
  assert.equal(general.issues.some((issue) => issue.code === "missing-keyframe"), false)
})

test("PAD4 超长提示词只提醒可读性，不冒充平台硬限制", () => {
  const preflight = preflightPlatformExport([shot({ prompt: "雨".repeat(1201) })], {
    target: "kling",
    keyframePathByTargetId: { "shot-1": "generated/selected/shot.png" },
  })
  const issue = preflight.issues.find((item) => item.code === "long-prompt")
  assert.ok(issue)
  assert.equal(issue.severity, "warning")
  assert.match(issue.message, /1200/)
  assert.match(issue.message, /可读性/)
  assert.doesNotMatch(issue.message, /平台拒收/)
})

test("PAD5 平台交付增加纯提示词文件和操作说明", () => {
  const kit = buildPlatformExportKit({
    title: "雨夜快递",
    target: "kling",
    shots: [shot()],
    exportedAt: 123,
    keyframePathByTargetId: { "shot-1": "generated/selected/shot.png" },
  })
  const copy = kit.files.find((file) => file.path === "production/kling/copy-prompts.txt")
  const guide = kit.files.find((file) => file.path === "production/kling/platform-guide.md")
  assert.ok(copy)
  assert.ok(guide)
  assert.match(copy.content, /第 1 集 · 第 1 镜/)
  assert.match(copy.content, /delivery man knocking/)
  assert.doesNotMatch(copy.content, /Authorization|api[_-]?key/i)
  assert.match(guide.content, /首尾帧/)
  assert.match(guide.content, /导出前检查/)
})

test("PAD6 manifest 保存同一份 Profile", () => {
  const kit = buildPlatformExportKit({
    title: "雨夜快递",
    target: "jimeng",
    shots: [shot()],
    exportedAt: 456,
    keyframePathByTargetId: { "shot-1": "generated/selected/shot.png" },
  })
  assert.equal(kit.manifest.profile.mode, "image-to-video")
  assert.equal(kit.manifest.profile.target, "jimeng")
  const file = kit.files.find((entry) => entry.path === "production/jimeng/manifest.json")!
  const parsed = JSON.parse(file.content) as Record<string, unknown>
  assert.equal((parsed.profile as Record<string, unknown>).target, "jimeng")
})

test("PAD7 导出菜单展示当前目标 Profile", () => {
  const bar = fs.readFileSync("components/ProjectBar.tsx", "utf8")
  assert.match(bar, /platformProfile/)
  assert.match(bar, /profile\.summary/)
  assert.match(bar, /profile\.steps/)
})

import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import { planExternalVideoImport } from "../lib/video/external-import.ts"
import { SAMPLE_SHOTS } from "../lib/sample.ts"

test("P7-A 无规则文件名可手动映射，且手动选择优先于自动解析", () => {
  const manualShot = SAMPLE_SHOTS[4]
  const overriddenShot = SAMPLE_SHOTS[2]
  const plan = planExternalVideoImport({
    shots: SAMPLE_SHOTS,
    files: [
      { index: 0, name: "same-name.mp4", size: 1000, type: "video/mp4" },
      { index: 1, name: "E01-S03.mp4", size: 1000, type: "video/mp4" },
    ],
    manualTargets: {
      0: manualShot.entityId,
      1: overriddenShot.entityId,
    },
  })
  const duplicate = planExternalVideoImport({
    shots: SAMPLE_SHOTS,
    files: [
      { index: 0, name: "take-a.mp4", size: 1000, type: "video/mp4" },
      { index: 1, name: "take-b.mp4", size: 1000, type: "video/mp4" },
    ],
    manualTargets: {
      0: manualShot.entityId,
      1: manualShot.entityId,
    },
  })

  assert.equal(plan.mapped.length, 2)
  assert.equal(
    plan.mapped.find((item) => item.fileIndex === 0)?.targetId,
    manualShot.entityId,
  )
  assert.equal(
    plan.mapped.find((item) => item.fileIndex === 1)?.targetId,
    overriddenShot.entityId,
  )
  assert.equal(duplicate.mapped.length, 0)
  assert.match(JSON.stringify(duplicate.issues), /重复匹配同一镜头/)
})

test("P7-B 非法文件不能通过手动映射绕过", () => {
  const plan = planExternalVideoImport({
    shots: SAMPLE_SHOTS,
    files: [
      { index: 0, name: "not-video.mp4", size: 1000, type: "text/plain" },
      { index: 1, name: "too-large.mp4", size: 81 * 1024 * 1024, type: "video/mp4" },
    ],
    manualTargets: {
      0: SAMPLE_SHOTS[0].entityId,
      1: SAMPLE_SHOTS[1].entityId,
    },
  })

  assert.equal(plan.mapped.length, 0)
  assert.equal(plan.issues.length, 2)
  assert.match(JSON.stringify(plan.issues), /MP4|80MB/)
})

test("P7-C 批量预览提供逐文件镜头选择器，E2E 覆盖手动兜底", () => {
  const panel = fs.readFileSync("components/BatchVideoPanel.tsx", "utf8")
  const css = fs.readFileSync("app/globals.css", "utf8")
  const script = fs.readFileSync("scripts/verify-core-production.mjs", "utf8")

  assert.match(panel, /manualTargets/)
  assert.match(panel, /选择镜头/)
  assert.match(panel, /为 \$\{file\.name\} 选择镜头/)
  assert.match(css, /\.external-video-batch-select/)
  assert.match(script, /take-from-jimeng\.mp4/)
  assert.match(script, /第 3 集 · 镜 02/)
  assert.match(script, /2 个可导入/)
  assert.match(script, /external-video-batch-desktop\.png/)
  assert.match(script, /external-video-batch-mobile\.png/)
})

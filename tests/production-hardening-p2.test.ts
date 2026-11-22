import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

test("P2-A 导出确认后立即关闭弹层，播放器可继续操作", () => {
  const player = fs.readFileSync("components/StoryboardPreview.tsx", "utf8")
  const css = fs.readFileSync("app/storyboard/storyboard.css", "utf8")

  assert.match(
    player,
    /async function exportStoryboard\(\)[\s\S]*?setExportBusy\(true\)[\s\S]*?setExportOpen\(false\)[\s\S]*?storyboard-exports/,
  )
  assert.match(player, /role="status"/)
  assert.match(player, /正在渲染分享视频/)
  assert.match(css, /\.storyboard-export-status/)
})

test("P2-B 浏览器 E2E 下载并用 FFprobe 验证真实 MP4 与 SRT", () => {
  const script = fs.readFileSync("scripts/verify-core-production.mjs", "utf8")

  assert.match(script, /TTS_ENABLED:\s*"0"/)
  assert.match(script, /导出分享视频/)
  assert.match(script, /确认并导出/)
  assert.match(script, /下载 MP4/)
  assert.match(script, /下载 SRT/)
  assert.match(script, /ffprobePath/)
  assert.match(script, /storyboard-share\.mp4/)
  assert.match(script, /storyboard-share\.srt/)
  assert.match(script, /storyboard-export-dialog-desktop\.png/)
  assert.match(script, /storyboard-export-running-desktop\.png/)
  assert.match(script, /storyboard-export-ready-desktop\.png/)
  assert.match(script, /storyboard-export-dialog-mobile\.png/)
  assert.match(script, /codec_type/)
  assert.match(script, /苏婉/)
})

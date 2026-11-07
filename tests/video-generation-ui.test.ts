import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

test("P0-V4 分镜页同时提供首帧批量与镜头视频批量入口", () => {
  const shotList = fs.readFileSync("components/ShotList.tsx", "utf8")
  assert.match(shotList, /BatchVideoPanel/)
  assert.match(shotList, /批量生成.*镜头视频/)
})

test("P0-V4 视频批量明确预算、候选和持久任务边界", () => {
  const panel = fs.readFileSync("components/BatchVideoPanel.tsx", "utf8")
  assert.match(panel, /已选/)
  assert.match(panel, /estimatedCost/)
  assert.match(panel, /创作额度/)
  assert.match(panel, /不会自动采用/)
  assert.match(panel, /可以继续切换菜单/)
  assert.match(panel, /retryVideoTask/)
  assert.match(panel, /result\.failures/)
  assert.match(panel, /预留/)
  assert.match(panel, /实付/)
})

test("P0-V4c 任务中心对视频失败项复用重试接口", () => {
  const panel = fs.readFileSync("components/GenerationTaskPanel.tsx", "utf8")
  assert.match(panel, /retryVideoTask/)
  assert.match(panel, /task\.mediaKind === 'video'/)
})

test("VIDEO-MODEL1 Web 视频面板使用服务端能力和动态价格", () => {
  const shot = fs.readFileSync("components/ShotVideoPanel.tsx", "utf8")
  const batch = fs.readFileSync("components/BatchVideoPanel.tsx", "utf8")
  const settings = fs.readFileSync("components/VideoGenerationSettings.tsx", "utf8")

  assert.match(shot, /useVideoCapabilities/)
  assert.match(batch, /useVideoCapabilities/)
  assert.match(shot, /<VideoGenerationSettings/)
  assert.match(batch, /<VideoGenerationSettings/)
  assert.match(settings, /videoPricePerSecond/)
  assert.doesNotMatch(shot, /const VIDEO_MODEL\s*=\s*["']MiniMax-H3-Lite/)
  assert.doesNotMatch(shot, /const PRICE_PER_SECOND\s*=/)
  assert.doesNotMatch(batch, /const PRICE_PER_SECOND\s*=/)
})

test("VIDEO-MODEL2 单镜失败可直接重试并显示结算成本", () => {
  const shot = fs.readFileSync("components/ShotVideoPanel.tsx", "utf8")

  assert.match(shot, /retryVideoTask/)
  assert.match(shot, /重试失败任务/)
  assert.match(shot, /estimatedCostMicros/)
  assert.match(shot, /actualCostMicros/)
})

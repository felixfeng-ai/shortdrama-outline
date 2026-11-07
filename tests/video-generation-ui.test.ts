import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

test("P0-V4 分镜页同时提供首帧批量与镜头视频批量入口", () => {
  const shotList = fs.readFileSync("components/ShotList.tsx", "utf8")
  const page = fs.readFileSync("app/page.tsx", "utf8")
  assert.match(shotList, /BatchVideoPanel/)
  assert.match(shotList, /批量生成.*镜头视频/)
  assert.match(page, /openShotWorkspace\('video'\)/)
  assert.match(page, /extraAction=/)
  assert.match(page, /wfx-page-actions[\s\S]*openShotWorkspace\('video'\)/)
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

test("VIDEO-CANDIDATES1 批量视频工作区渲染真实候选并支持采用", () => {
  const panel = fs.readFileSync("components/BatchVideoPanel.tsx", "utf8")

  assert.match(panel, /setVideoAssets/)
  assert.match(panel, /state\.assets\.filter/)
  assert.match(panel, /selectVideo/)
  assert.match(panel, /<video/)
  assert.match(panel, /采用并加入时间线/)
  assert.match(panel, /本集候选/)
})

test("VIDEO-CANDIDATES2 视频页签候选数跟随当前筛选且时间线可返回采用", () => {
  const shotList = fs.readFileSync("components/ShotList.tsx", "utf8")

  assert.match(shotList, /visibleVideoAssets/)
  assert.match(shotList, /条本集候选/)
  assert.match(shotList, /onOpenVideo=/)
  assert.match(shotList, /workspaceMode !== 'storyboard'[\s\S]*setTreeOpen\(false\)/)
  assert.match(shotList, /\{treeOpen && \(/)
})

test("VIDEO-TIMELINE1 已有候选但未采用时明确提示，而不是只报缺视频", () => {
  const timeline = fs.readFileSync("components/EpisodeTimelinePanel.tsx", "utf8")

  assert.match(timeline, /missingClipsWithUnselectedCandidates/)
  assert.match(timeline, /staleAdoptedClips/)
  assert.match(timeline, /已有候选视频，但尚未采用/)
  assert.match(timeline, /去采用视频/)
  assert.match(timeline, /同步已采用视频/)
  assert.match(timeline, /条候选，尚未采用/)
})

test("VIDEO-CANDIDATES3 视频候选保持紧凑资产卡，生成设置按需展开", () => {
  const panel = fs.readFileSync("components/BatchVideoPanel.tsx", "utf8")
  const styles = fs.readFileSync("app/globals.css", "utf8")

  assert.match(panel, /candidateScopeLabel/)
  assert.match(
    panel,
    /<SmoothCollapse open=\{open\}>[\s\S]*batch-video-generation-settings[\s\S]*<VideoGenerationSettings/,
  )
  assert.match(styles, /grid-template-columns:\s*repeat\(auto-fill, minmax\(220px, 280px\)\)/)
  assert.match(styles, /\.batch-video-candidate-media\s*\{[\s\S]*aspect-ratio/)
})

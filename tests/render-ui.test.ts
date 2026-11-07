import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

test("P1-V5.12 时间线提供对白试听、从头重放和溢出阻断提示", () => {
  const timeline = fs.readFileSync("components/EpisodeTimelinePanel.tsx", "utf8")
  assert.match(timeline, /<audio/)
  assert.match(timeline, /从头重放/)
  assert.match(timeline, /对白超出镜头时长/)
})

test("P1-V5.15 时间线接入渲染队列和 MP4/SRT/manifest 下载", () => {
  const timeline = fs.readFileSync("components/EpisodeTimelinePanel.tsx", "utf8")
  const client = fs.readFileSync("lib/video/render-client.ts", "utf8")
  assert.match(timeline, /加入渲染队列/)
  assert.match(timeline, /下载 MP4/)
  assert.match(timeline, /下载 SRT/)
  assert.match(timeline, /下载 manifest/)
  assert.match(client, /\/api\/video\/renders/)
})

test("P1-V5.16 成片阶段先展示播放与下载结果，再展示时间线编辑细节", () => {
  const timeline = fs.readFileSync("components/EpisodeTimelinePanel.tsx", "utf8")
  const styles = fs.readFileSync("app/globals.css", "utf8")

  assert.match(timeline, /latestSuccessfulRender/)
  assert.match(timeline, /episode-timeline-output/)
  assert.match(timeline, /<video[\s\S]*latestSuccessfulRender/)
  assert.match(timeline, /下载 MP4/)
  assert.ok(
    timeline.indexOf("episode-timeline-output") < timeline.indexOf("episode-timeline-clips"),
    "成片输出应排在镜头编辑列表之前",
  )
  assert.match(timeline, /episode-timeline-sections/)
  assert.match(timeline, /timelineSection === 'audio'/)
  assert.match(timeline, /timelineSection === 'render'/)
  assert.match(styles, /\.episode-timeline-output\s*\{/)
})

test("BGM-INLINE 无曲目时禁用应用按钮，并在控件旁显示保存状态", () => {
  const timeline = fs.readFileSync("components/EpisodeTimelinePanel.tsx", "utf8")

  assert.match(timeline, /bgmCanApply/)
  assert.match(timeline, /bgmStatus/)
  assert.match(timeline, /未选择曲目/)
  assert.match(timeline, /role=\{bgmStatus\.kind === 'error' \? 'alert' : 'status'\}/)
})

test("BGM-LIBRARY 提供智能推荐、系统曲库与我的上传三个完整入口", () => {
  const timeline = fs.readFileSync("components/EpisodeTimelinePanel.tsx", "utf8")

  assert.match(timeline, /bgmUploadOpen/)
  assert.match(timeline, /智能推荐/)
  assert.match(timeline, /系统曲库/)
  assert.match(timeline, /我的上传/)
  assert.match(timeline, /recommendedBgmTracks/)
  assert.match(timeline, /filteredSystemBgmTracks/)
  assert.match(timeline, /episode-bgm-card/)
  assert.match(timeline, /onToggle=\{\(event\) => setBgmUploadOpen\(event\.currentTarget\.open\)\}/)
})

test("RENDER-STATE 默认打开成片状态台，明确区分成功、失败、运行和阻断", () => {
  const timeline = fs.readFileSync("components/EpisodeTimelinePanel.tsx", "utf8")

  assert.match(timeline, /useState<'clips' \| 'audio' \| 'render'>\('render'\)/)
  assert.match(timeline, /renderStateLabel/)
  assert.match(timeline, /成片成功/)
  assert.match(timeline, /渲染失败/)
  assert.match(timeline, /渲染中/)
  assert.match(timeline, /被阻断/)
  assert.match(timeline, /episode-timeline-output-attempts/)
  assert.match(timeline, /preload="auto"/)
  assert.match(timeline, /episode-timeline-video-hint/)
  assert.match(timeline, /download>下载 MP4/)
  assert.doesNotMatch(timeline, /const actionLabel =/)
})

test("TIMELINE-STALE-CTA 已采用但草稿未同步时，成片状态直接提供同步", () => {
  const timeline = fs.readFileSync("components/EpisodeTimelinePanel.tsx", "utf8")

  assert.match(timeline, /staleAdoptedClips\.length/)
  assert.match(timeline, /待同步/)
  assert.match(timeline, /同步 \$\{staleAdoptedClips\.length\} 个已采用视频/)
  assert.match(timeline, /onClick=\{syncAdoptedVideos\}/)
})

test("RENDER-FROZEN-STALE 旧固化版本缺视频时禁止直接渲染，并提供同步后重新固化", () => {
  const timeline = fs.readFileSync("components/EpisodeTimelinePanel.tsx", "utf8")

  assert.match(timeline, /selectedVersionBlockedCount/)
  assert.match(timeline, /selectedVersionStaleAdoptedClips/)
  assert.match(timeline, /syncAndFreezeLatestVideos/)
  assert.match(timeline, /当前所选版本仍有/)
  assert.match(timeline, /同步并固化新版本/)
  assert.match(timeline, /selectedVersionBlockedCount > 0/)
})

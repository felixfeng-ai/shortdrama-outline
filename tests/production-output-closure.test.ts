import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

function read(path: string): string {
  return fs.readFileSync(path, "utf8")
}

test("OUTPUT-CLOSURE-1 产物中心默认先展示成品，再展示创作版本和确认队列", () => {
  const component = read("components/ArtifactCenter.tsx")

  assert.match(component, /type CenterTab = "outputs" \| "versions" \| "queue"/)
  assert.match(component, /useState<CenterTab>\("outputs"\)/)
  assert.match(component, />\s*成品\s*</)
  assert.match(component, />\s*创作产物\s*</)
  assert.match(component, />\s*确认队列\s*</)
})

test("OUTPUT-CLOSURE-2 成品页区分成片、交付物、发布记录和创作产物", () => {
  const component = read("components/ArtifactCenter.tsx")

  for (const label of ["成片", "交付物", "发布记录", "创作产物"]) {
    assert.match(component, new RegExp(label))
  }
  assert.match(component, /最近可播放成片/)
  assert.match(component, /去生成成片/)
  assert.match(component, /打开交付中心/)
})

test("OUTPUT-CLOSURE-3 产物中心读取当前项目全部渲染和交付包", () => {
  const component = read("components/ArtifactCenter.tsx")
  const client = read("lib/video/render-client.ts")

  assert.match(component, /fetchVideoRenders/)
  assert.match(component, /fetchDeliveryPackages/)
  assert.match(client, /episode\?: number/)
  assert.match(client, /if \(episode !== undefined\)/)
})

test("OUTPUT-CLOSURE-4 成片状态使用真实视频并只给出一个当前主操作", () => {
  const timeline = read("components/EpisodeTimelinePanel.tsx")

  assert.match(timeline, /最近可播放成片/)
  assert.match(timeline, /outputPrimaryAction/)
  assert.match(timeline, /<video[\s\S]*latestSuccessfulRender/)
  assert.doesNotMatch(timeline, /占位视频/)
})

test("OUTPUT-CLOSURE-5 交付中心明确成品来源和当前阻断", () => {
  const delivery = read("components/DeliveryCenter.tsx")

  assert.match(delivery, /成品来源/)
  assert.match(delivery, /还没有正式交付版成片/)
  assert.match(delivery, /去分镜页生成成片/)
})

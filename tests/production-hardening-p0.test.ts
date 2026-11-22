import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { createRequire } from "node:module"
import fs from "node:fs"
import test from "node:test"

const require = createRequire(import.meta.url)
const ffprobePath = (require("@ffprobe-installer/ffprobe") as { path: string }).path

function read(path: string): string {
  return fs.readFileSync(path, "utf8")
}

test("P0-A 移动工作舱收起时只隐藏 body，Agent 保持挂载", () => {
  const page = read("app/page.tsx")
  const css = read("app/globals.css")
  const bodyStart = page.indexOf('className="h-deck-body"')
  const body = bodyStart >= 0 ? page.slice(bodyStart, page.indexOf("</aside>", bodyStart)) : ""

  assert.match(page, /data-open=\{deckOpen \? 'true' : 'false'\}/)
  assert.notEqual(body, "")
  assert.doesNotMatch(body, /\{deckOpen \? \(/)
  assert.match(body, /agentDeckMounted \? \([\s\S]*?<AgentDock/)
  assert.match(
    css,
    /\.h-deck:not\(\.open\) \.h-deck-body\s*\{[\s\S]*?display:\s*none;/,
  )
})

test("P0-B1 示例入口可见，并从起始页回到项目总览", () => {
  const onboarding = read("components/WorkspaceOnboarding.tsx")
  const page = read("app/page.tsx")

  assert.match(onboarding, /wfx-onboarding-sample-link/)
  assert.match(onboarding, /查看完整示例/)
  assert.match(page, /async function handleLoadSample\(\)/)
  assert.match(
    page,
    /handleLoadSample[\s\S]*?writeProjectToUrl\(project\.id, 'push'\)[\s\S]*?goWorkspaceHome\(\)/,
  )
  assert.match(
    page,
    /const goWorkspaceHome = \(\) => \{[\s\S]*?params\.delete\('new'\)/,
  )
})

test("P0-B2 示例项目必须补齐一条真实可播放成片", () => {
  const route = read("app/api/sample/route.ts")
  const manifest = JSON.parse(read("public/sample/sample-production.json")) as {
    durationMs: number
    width?: number
    height?: number
  }
  const subtitles = read("public/sample/sample-production.srt")
  const probe = spawnSync(ffprobePath, [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-show_entries",
    "stream=codec_type,width,height,duration",
    "-of",
    "json",
    "public/sample/sample-production.mp4",
  ], { encoding: "utf8" })

  assert.match(route, /ensureSampleProduction/)
  assert.match(route, /sampleProduction/)
  assert.equal(probe.status, 0, probe.stderr)
  const media = JSON.parse(probe.stdout) as {
    format: { duration: string }
    streams: Array<{ codec_type: string; width?: number; height?: number }>
  }
  const video = media.streams.find((stream) => stream.codec_type === "video")
  assert.equal(video?.width, 1080)
  assert.equal(video?.height, 1920)
  assert.equal(manifest.width, 1080)
  assert.equal(manifest.height, 1920)
  assert.equal(manifest.durationMs, 6_000)
  assert.ok(Math.abs(Number(media.format.duration) * 1_000 - manifest.durationMs) <= 100)

  const cueEnds = [...subtitles.matchAll(/-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})/g)]
    .map((match) => (
      Number(match[1]) * 3_600_000
      + Number(match[2]) * 60_000
      + Number(match[3]) * 1_000
      + Number(match[4])
    ))
  assert.equal(cueEnds.at(-1), manifest.durationMs)
})

test("P0-C 用户可见定位只承诺当前已开放的短剧生产", () => {
  const visibleFiles = [
    "app/layout.tsx",
    "app/start/page.tsx",
    "components/LoginPanel.tsx",
    "lib/releases.ts",
    "lib/pwa.ts",
  ]
  const visibleCopy = visibleFiles.map(read).join("\n")
  const design = read("DESIGN.md")
  const brand = read("docs/brand-guidelines.md")

  assert.doesNotMatch(visibleCopy, /短剧与漫剧生产/)
  assert.doesNotMatch(visibleCopy, /漫剧生产链路开放/)
  assert.doesNotMatch(design, /对外品类固定为 `AI 短剧与漫剧生产平台`/)
  assert.doesNotMatch(brand, /\*\*AI 短剧与漫剧生产平台\*\*/)
})

test("P0-D 核心生产链有独立浏览器 E2E 门禁", () => {
  const pkg = JSON.parse(read("package.json")) as {
    scripts: Record<string, string>
  }
  const scriptPath = "scripts/verify-core-production.mjs"

  assert.equal(pkg.scripts["test:e2e:core"], "node scripts/verify-core-production.mjs")
  assert.equal(fs.existsSync(scriptPath), true)
  const script = fs.existsSync(scriptPath) ? read(scriptPath) : ""
  assert.match(script, /查看完整示例项目/)
  assert.match(script, /Veya Agent/)
  assert.match(script, /timeLine|timeline|时间线成片/)
  assert.match(script, /delivery|交付中心/)
  assert.match(script, /sample-production\.mp4|video/)
  assert.match(script, /1440/)
  assert.match(script, /390/)
})

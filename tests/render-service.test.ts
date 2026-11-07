import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"

import {
  buildFfmpegRenderArgs,
  resolveFfmpegPath,
  resolveFfprobePath,
  type RenderCommandInput,
} from "../lib/video/render-engine.ts"

test("P1-V5.15 FFmpeg 计划按镜头裁剪拼接，并把对白与 BGM 混到独立音轨", () => {
  const input: RenderCommandInput = {
    ffmpegPath: "ffmpeg",
    outputPath: "output.mp4",
    width: 1080,
    height: 1920,
    fps: 30,
    totalDurationMs: 5_000,
    clips: [
      { inputIndex: 0, inMs: 0, outMs: 2_000 },
      { inputIndex: 1, inMs: 500, outMs: 3_500 },
    ],
    dialogue: [
      { inputIndex: 2, startMs: 0, volume: 1 },
      { inputIndex: 3, startMs: 2_000, volume: 1 },
    ],
    bgm: { inputIndex: 4, volume: 0.2, fadeInMs: 600, fadeOutMs: 1_000 },
  }
  const args = buildFfmpegRenderArgs(input)
  const filter = args[args.indexOf("-filter_complex") + 1]

  assert.ok(args.includes("output.mp4"))
  assert.match(filter, /trim=start=0:end=2/)
  assert.match(filter, /trim=start=0\.5:end=3\.5/)
  assert.match(filter, /concat=n=2:v=1:a=0/)
  assert.match(filter, /adelay=0\|0/)
  assert.match(filter, /adelay=2000\|2000/)
  assert.match(filter, /volume=0\.2/)
  assert.match(filter, /afade=t=in:st=0:d=0\.6/)
  assert.match(filter, /afade=t=out:st=4:d=1/)
  assert.equal(args.includes("-shortest"), false)
})

test("MEDIA-BINARY 生产环境可从项目根目录解析 FFmpeg 与 FFprobe", () => {
  for (const binary of [resolveFfmpegPath(), resolveFfprobePath()]) {
    assert.equal(path.isAbsolute(binary), true)
    assert.equal(fs.existsSync(binary), true)
  }
})

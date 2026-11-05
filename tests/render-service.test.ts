import { test } from "node:test"
import assert from "node:assert/strict"

import {
  buildFfmpegRenderArgs,
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
    bgm: { inputIndex: 4, volume: 0.2 },
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
  assert.equal(args.includes("-shortest"), false)
})

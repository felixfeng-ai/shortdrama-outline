import { test } from "node:test"
import assert from "node:assert/strict"

import { buildPublishAss } from "../lib/delivery/subtitles.ts"

const SRT = [
  "1",
  "00:00:01,000 --> 00:00:02,500",
  "第一句对白",
  "",
  "2",
  "00:00:03,000 --> 00:00:04,250",
  "第二句，含逗号",
  "",
].join("\r\n")

test("DELIVERY-SUB1 把旁挂 SRT 转成固定尺寸 ASS", () => {
  const ass = buildPublishAss({
    srt: SRT,
    style: "cinematic",
    width: 1080,
    height: 1920,
  })
  assert.match(ass, /\[Script Info\]/)
  assert.match(ass, /PlayResX: 1080/)
  assert.match(ass, /PlayResY: 1920/)
  assert.match(ass, /^Style: Default,/m)
  assert.match(ass, /Dialogue: 0,0:00:01\.00,0:00:02\.50/)
  assert.match(ass, /第一句对白/)
  assert.match(ass, /第二句，含逗号/)
})

test("DELIVERY-SUB2 三种字幕风格有不同字号或描边", () => {
  const clean = buildPublishAss({
    srt: SRT,
    style: "clean",
    width: 1080,
    height: 1920,
  })
  const bold = buildPublishAss({
    srt: SRT,
    style: "bold",
    width: 1080,
    height: 1920,
  })
  assert.notEqual(clean.match(/^Style: Default,(.*)$/m)?.[1], bold.match(/^Style: Default,(.*)$/m)?.[1])
})

test("DELIVERY-SUB3 ASS 特殊字符不会破坏样式段", () => {
  const ass = buildPublishAss({
    srt: [
      "1",
      "00:00:00,500 --> 00:00:01,500",
      "花括号 {不能} 破坏",
      "",
    ].join("\n"),
    style: "clean",
    width: 1080,
    height: 1920,
  })
  assert.match(ass, /花括号 \\\{不能\\\} 破坏/)
})


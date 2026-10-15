import { test } from "node:test"
import assert from "node:assert/strict"

import { DEFAULT_SHOT_DURATION, SHOT_DURATIONS, isSupportedDuration } from "../lib/assets/types.ts"
import { normalizeShots } from "../lib/assets/normalize.ts"

// ── E12 单镜时长必须是平台认的档位 ──
//
// 以前这里是 1-30 的自由数字框。用户填 7 秒，平台照样导出，
// 到了出视频平台才被拒收——即梦视频 3.0 的 frames 只接受 121（5 秒）和 241（10 秒）。
// 「照单执行」断在最后一步，用户却以为是自己的问题。
//
// 所以时长必须是枚举，而且旧数据里的非标档位要能被识别出来（而不是被静默改成 5 秒）。

test("E12 时长档位只有出视频平台普遍接受的那几个", () => {
  assert.ok(SHOT_DURATIONS.includes(5), "缺 5 秒档")
  assert.ok(SHOT_DURATIONS.includes(10), "缺 10 秒档")
  for (const d of SHOT_DURATIONS) {
    assert.ok(Number.isInteger(d) && d > 0, `${d} 不是正整数`)
  }
})

test("E12b isSupportedDuration 认得出非标档位（旧数据里的 7 秒要被标出来）", () => {
  for (const d of SHOT_DURATIONS) assert.equal(isSupportedDuration(d), true)
  assert.equal(isSupportedDuration(7), false)
  assert.equal(isSupportedDuration(0), false)
  assert.equal(isSupportedDuration(30), false)
})

test("E12c 新生成的镜头默认落在合法档位上", () => {
  const shots = normalizeShots({
    raw: { shots: [{ scene: "咖啡馆", characters: [], action: "推门", shotSize: "中景", camera: "固定", prompt: "x" }] },
    visuals: [], stamp: 1,
  })
  assert.ok(isSupportedDuration(shots[0].params.duration), "默认时长不在合法档位里")
})

test("E12d 默认是 10 秒档，不是 5 秒", () => {
  // 为什么：一部 10 集剧约 900 秒。按 5 秒/镜要 180 镜，而分镜那一步一次调用
  // 的输出预算装不下（实测 152 token/镜 × 180 = 27,360 > maxTokens 24,000）；
  // 10 秒/镜只要 90 镜，13,680 token，装得下。5 秒档仍然可选，只是不再是默认。
  const shots = normalizeShots({
    raw: { shots: [{ scene: "咖啡馆", characters: [], action: "推门", shotSize: "中景", camera: "固定", prompt: "x" }] },
    visuals: [], stamp: 1,
  })
  assert.equal(shots[0].params.duration, 10)
  assert.equal(DEFAULT_SHOT_DURATION, 10)
})

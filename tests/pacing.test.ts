import { test } from "node:test"
import assert from "node:assert/strict"

import {
  clampIntensity,
  isFlatPacing,
  pacingExtremes,
  pacingHint,
  pacingSeries,
} from "../lib/pacing.ts"

test("P1 强度夹在 1-5，非法值退回 3", () => {
  assert.equal(clampIntensity(0), 1)
  assert.equal(clampIntensity(9), 5)
  assert.equal(clampIntensity(2.6), 3)
  assert.equal(clampIntensity("x"), 3)
  assert.equal(clampIntensity(undefined), 3)
})

test("P2 没有打分的集按 3 处理", () => {
  assert.deepEqual(pacingSeries([{ intensity: 1 }, {}, { intensity: 5 }]), [1, 3, 5])
})

test("P3 只用 ≤2 个档位判为平线", () => {
  assert.equal(isFlatPacing([3, 3, 3, 3]), true)
  assert.equal(isFlatPacing([3, 4, 3, 4]), true)
  assert.equal(isFlatPacing([1, 3, 5]), false)
  assert.equal(isFlatPacing([3, 3]), false)
})

test("P4 极值集号与提示", () => {
  assert.deepEqual(pacingExtremes([3, 1, 4, 5, 2]), { low: 2, high: 4 })
  assert.equal(pacingExtremes([3, 3, 3]), null)
  assert.match(pacingHint([3, 1, 4, 5, 2]), /第 2 集/)
  assert.match(pacingHint([3, 3, 3]), /平线/)
})

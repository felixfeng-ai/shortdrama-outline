import { test } from "node:test"
import assert from "node:assert/strict"

import { buildEpisodePrompt } from "../lib/prompts.ts"
import { normalizeEpisodes } from "../lib/normalize.ts"
import { readEpisodes } from "../lib/validate.ts"
import {
  DEFAULT_EPISODE_COUNT,
  MAX_EPISODE_COUNT,
  clampEpisodeCount,
  episodeQuotaUnits,
  episodeTokenBudget,
  planEpisodeBatches,
  projectQuotaUnits,
  readEpisodeCount,
  readEpisodeStart,
} from "../lib/episodes.ts"
import type { Act, Character } from "../lib/types.ts"

const characters: Character[] = [
  { id: "c1", name: "陈默", identity: "快递员", personality: "沉默", motivation: "证明自己", arc: "主动放弃" },
]
const acts: Act[] = [
  { id: "a1", key: "setup", title: "第一幕", summary: "接到遗产", beats: ["雨夜", "铁门"] },
]

test("EP1 集数选择：默认 30，6–120 之间夹紧", () => {
  assert.equal(DEFAULT_EPISODE_COUNT, 30)
  assert.equal(readEpisodeCount(undefined), 30)
  assert.equal(readEpisodeCount(10), 10)
  assert.equal(readEpisodeCount("60"), 60)
  assert.equal(clampEpisodeCount(0), 6)
  assert.equal(clampEpisodeCount(999), MAX_EPISODE_COUNT)
})

test("EP2 分集 prompt 用选定集数，不再写死 10", () => {
  const { system, user } = buildEpisodePrompt("快递员", characters, acts, undefined, {
    start: 1,
    count: 30,
    total: 30,
  })
  assert.match(system, /30 集/)
  assert.match(system, /1 连续到 30/)
  assert.doesNotMatch(system, /正好 10 个元素/)
  assert.match(user, /生成 30 集分集剧情/)
})

test("EP3 分批：60 集拆成 6 批，每批 10 集", () => {
  const batches = planEpisodeBatches(60)
  assert.equal(batches.length, 6)
  assert.deepEqual(batches[0], { start: 1, end: 10 })
  assert.deepEqual(batches[5], { start: 51, end: 60 })
})

test("EP4 分批 prompt 承接前文，且只要求本批集数", () => {
  const { system } = buildEpisodePrompt("快递员", characters, acts, undefined, {
    start: 11,
    count: 10,
    total: 60,
    previous: "1. 雨夜：陈默收到信封",
  })
  assert.match(system, /第 11 集到第 20 集/)
  assert.match(system, /11 连续到 20/)
  assert.match(system, /已生成的前 10 集/)
  assert.match(system, /不要重复/)
})

test("EP5 normalize 支持偏移编号，并保留超过 10 集", () => {
  const raw = {
    episodes: Array.from({ length: 10 }, (_, i) => ({
      title: `第 ${i + 1} 集`,
      synopsis: "梗概",
      hook: "钩子",
    })),
  }
  const list = normalizeEpisodes(raw, 1, { offset: 10, limit: 30 })
  assert.equal(list.length, 10)
  assert.equal(list[0].number, 11)
  assert.equal(list[9].number, 20)
})

test("EP6 readEpisodes 不再截断到 10 集", () => {
  const payload = Array.from({ length: 30 }, (_, i) => ({
    id: `e${i}`,
    title: `第 ${i + 1} 集`,
    synopsis: "梗概",
    hook: "钩子",
  }))
  assert.equal(readEpisodes(payload).length, 30)
})

test("EP7 额度与 token 预算随集数增长", () => {
  assert.equal(episodeQuotaUnits(10), 3)
  assert.equal(episodeQuotaUnits(30), 9)
  assert.equal(episodeQuotaUnits(60), 18)
  assert.ok(episodeTokenBudget(10) <= 8000)
  assert.ok(episodeTokenBudget(10) > episodeTokenBudget(5))
})

test("EP8 一部完整项目的额度随集数变化：10/30/60 = 13/19/28", () => {
  assert.equal(projectQuotaUnits(10), 13)
  assert.equal(projectQuotaUnits(30), 19)
  assert.equal(projectQuotaUnits(60), 28)
})

test("EP9 起始集夹在 1..120", () => {
  assert.equal(readEpisodeStart(2), 2)
  assert.equal(readEpisodeStart(0), 1)
  assert.equal(readEpisodeStart(999), MAX_EPISODE_COUNT)
})

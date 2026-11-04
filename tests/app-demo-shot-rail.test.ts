import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

import {
  orderedShotsForSelection,
  shotPreview,
  shotStatusLabel,
} from "../lib/app-demo-data.ts"
import type { Shot } from "../lib/assets/types.ts"

function shot(number: number, overrides: Partial<Shot> = {}): Shot {
  return {
    id: `id-${number}`,
    entityId: `entity-${number}`,
    shot: number,
    episode: 3,
    scene: "地下站台",
    characters: ["顾遥"],
    action: `第 ${number} 镜动作`,
    speaker: "顾遥",
    dialogue: `第 ${number} 镜台词`,
    place: "地下站台",
    shotSize: "近景",
    camera: "固定",
    prompt: `shot ${number}`,
    refImages: [],
    missingRefFor: [],
    params: { ratio: "9:16", duration: 5, lastFrame: false },
    status: "todo",
    ...overrides,
  }
}

test("SR1 选中镜头排到首位，其余镜头保持原顺序", () => {
  const shots = [shot(10), shot(11), shot(12)]
  assert.deepEqual(orderedShotsForSelection(shots, 11).map((item) => item.shot), [11, 10, 12])
  assert.deepEqual(orderedShotsForSelection(shots, 99).map((item) => item.shot), [10, 11, 12])
})

test("SR2 镜头状态和摘要适合轨道紧凑展示", () => {
  assert.equal(shotStatusLabel("todo"), "待出图")
  assert.equal(shotStatusLabel("done"), "已采用")
  assert.equal(shotStatusLabel("rework"), "需返修")
  assert.equal(shotPreview(shot(2)), "第 2 镜台词")
  assert.equal(shotPreview(shot(3, { dialogue: "" })), "第 3 镜动作")
  assert.equal(
    shotPreview(shot(4, { dialogue: "", action: "" })),
    "无台词，按画面调度",
  )
})

test("SR3 创作页接入真实镜头轨道与选中联动", () => {
  const source = fs.readFileSync("components/DoubaoStyleAgentApp.tsx", "utf8")
  assert.ok(source.includes("镜头轨道"), "缺少镜头轨道")
  assert.ok(source.includes("shotRailRef"), "轨道没有自动定位引用")
  assert.ok(source.includes("aria-pressed"), "镜头选择缺少可访问状态")
  assert.ok(source.includes("selectedShotNumber"), "没有独立保存选中镜头")
  assert.ok(source.includes("还没有分镜"), "缺少镜头空态")
})

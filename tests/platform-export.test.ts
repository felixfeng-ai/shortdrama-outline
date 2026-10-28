import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

import {
  PLATFORM_EXPORT_TARGETS,
  buildPlatformExportKit,
  platformLabel,
  preflightPlatformExport,
  readPlatformExportTarget,
} from "../lib/export/platforms.ts"
import type { Shot, VisualCharacter } from "../lib/assets/types.ts"

const visual: VisualCharacter = {
  id: "v1",
  entityId: "character-linyuan",
  name: "林远",
  age: "29岁",
  face: "长脸",
  hair: "黑色短发",
  marks: "左眉浅疤",
  wardrobe: "沙色夹克",
  props: "钥匙",
  anchor: "age: 29, face: 长脸, hair: 黑色短发, marks: 左眉浅疤",
}

function shot(over: Partial<Shot> = {}): Shot {
  return {
    id: "shot-row-1",
    entityId: "shot-entity-1",
    shot: 1,
    episode: 1,
    scene: "天台·夜",
    characters: ["林远"],
    action: "推门",
    speaker: "",
    dialogue: "",
    place: "旧仓库",
    shotSize: "中景",
    camera: "固定",
    prompt: "cinematic still, age: 29, face: 长脸, hair: 黑色短发, marks: 左眉浅疤",
    refImages: ["林远定妆"],
    missingRefFor: [],
    params: { ratio: "9:16", duration: 5, lastFrame: false },
    status: "todo",
    ...over,
  }
}

test("PLAT1 目标只能是通用、即梦、可灵和结构化 JSON", () => {
  assert.deepEqual([...PLATFORM_EXPORT_TARGETS], ["general", "jimeng", "kling", "json"])
  assert.equal(readPlatformExportTarget("jimeng"), "jimeng")
  assert.equal(readPlatformExportTarget("unknown"), "general")
  assert.equal(platformLabel("jimeng"), "即梦")
  assert.equal(platformLabel("kling"), "可灵")
})

test("PLAT2 预检逐镜报告参数、锚点、缺图和末镜首尾帧错误", () => {
  const preflight = preflightPlatformExport([
    shot({ params: { ratio: "9:16", duration: 7, lastFrame: false } }),
    shot({
      id: "shot-row-2",
      entityId: "shot-entity-2",
      shot: 2,
      prompt: "cinematic still without the current anchor",
      missingRefFor: ["林远"],
      params: { ratio: "4:3", duration: 10, lastFrame: true },
    }),
  ], {
    target: "jimeng",
    visuals: [visual],
  })

  assert.equal(preflight.target, "jimeng")
  assert.equal(preflight.blocking >= 2, true)
  assert.equal(preflight.warning >= 3, true)
  assert.ok(preflight.issues.some((issue) => issue.code === "invalid-duration" && issue.shot === 1))
  assert.ok(preflight.issues.some((issue) => issue.code === "invalid-ratio" && issue.shot === 2))
  assert.ok(preflight.issues.some((issue) => issue.code === "missing-reference" && issue.shot === 2))
  assert.ok(preflight.issues.some((issue) => issue.code === "missing-anchor" && issue.character === "林远"))
  assert.ok(preflight.issues.some((issue) => issue.code === "last-shot-chain" && issue.shot === 2))
})

test("PLAT3 即梦交付生成执行单、CSV、预检与结构化 manifest", () => {
  const kit = buildPlatformExportKit({
    title: "测试短剧",
    target: "jimeng",
    shots: [shot()],
    visuals: [visual],
    exportedAt: 123,
    keyframePathByTargetId: {
      "shot-entity-1": "generated/selected/shots/episode-01/第01镜.png",
    },
  })

  assert.equal(kit.target, "jimeng")
  assert.ok(kit.files.some((file) => file.path === "production/jimeng/shotlist.txt"))
  assert.ok(kit.files.some((file) => file.path === "production/jimeng/prompts.csv"))
  assert.ok(kit.files.some((file) => file.path === "production/jimeng/preflight.json"))
  assert.ok(kit.files.some((file) => file.path === "production/jimeng/manifest.json"))
  const list = kit.files.find((file) => file.path.endsWith("shotlist.txt"))!.content
  assert.match(list, /目标：即梦/)
  assert.match(list, /提示词/)
  assert.match(list, /首帧/)
  assert.match(list, /5 秒/)
  assert.doesNotMatch(list, /Authorization|api[_-]?key/i)
})

test("PLAT4 结构化 JSON 带稳定 schema、全部执行参数和预检结果", () => {
  const kit = buildPlatformExportKit({
    title: "测试短剧",
    target: "json",
    shots: [shot({ params: { ratio: "9:16", duration: 10, lastFrame: true } })],
    visuals: [visual],
    exportedAt: 456,
  })
  const file = kit.files.find((entry) => entry.path === "production/json/shots.json")
  assert.ok(file)
  const manifest = JSON.parse(file.content) as Record<string, unknown>
  assert.equal(manifest.schema, "chengju.platform-export")
  assert.equal(manifest.schemaVersion, 1)
  assert.equal(manifest.target, "json")
  assert.equal(manifest.exportedAt, 456)
  const shots = manifest.shots as Array<Record<string, unknown>>
  assert.equal(shots[0].episode, 1)
  assert.equal(shots[0].shot, 1)
  assert.equal((shots[0].params as Record<string, unknown>).duration, 10)
  assert.equal((manifest.preflight as Record<string, unknown>).target, "json")
})

test("PLAT5 30 集规模仍用一次纯函数渲染，不逐镜发网络请求", () => {
  const shots = Array.from({ length: 300 }, (_, index) => shot({
    id: `shot-${index + 1}`,
    entityId: `shot-entity-${index + 1}`,
    shot: index + 1,
    episode: Math.floor(index / 10) + 1,
  }))
  const kit = buildPlatformExportKit({
    title: "30 集测试",
    target: "kling",
    shots,
    visuals: [visual],
    exportedAt: 789,
  })
  assert.equal(kit.shotCount, 300)
  assert.equal(kit.files.some((file) => file.path === "production/kling/shotlist.txt"), true)
  assert.doesNotMatch(buildPlatformExportKit.toString(), /fetch\(/)
})

test("PLAT6 导出菜单与项目包实际接线目标选择和适配文件", () => {
  const projectBar = fs.readFileSync("components/ProjectBar.tsx", "utf8")
  const page = fs.readFileSync("app/page.tsx", "utf8")
  assert.ok(projectBar.includes("目标平台"))
  assert.ok(projectBar.includes("onExportTargetChange"))
  assert.ok(projectBar.includes("预检"))
  assert.ok(page.includes("buildPlatformExportKit"))
  assert.ok(page.includes("preflightPlatformExport"))
})

import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

import {
  buildProjectPackageManifest,
  buildExportReport,
  keyframeArchivePath,
  safePathSegment,
  safeProjectFileStem,
  uniqueArchivePath,
} from "../lib/export/package.ts"
import { buildStoryboardHtml, shotsToCsv } from "../lib/assets/export.ts"
import type { GeneratedAsset } from "../lib/generation/types.ts"
import type { Shot } from "../lib/assets/types.ts"

const shot: Shot = {
  id: "shot-row-1",
  entityId: "shot-entity-1",
  shot: 1,
  episode: 1,
  scene: "天台·夜",
  characters: ["林远"],
  action: "推门",
  speaker: "林远",
  dialogue: "你早就知道了。",
  place: "旧仓库",
  shotSize: "中景",
  camera: "固定",
  prompt: "wearing: 沙色短夹克",
  refImages: ["林远·定妆"],
  missingRefFor: ["苏婉"],
  params: { ratio: "9:16", duration: 10, lastFrame: true },
  status: "rework",
}

const asset: GeneratedAsset = {
  id: "asset-abcdef123456",
  taskId: "task-1",
  projectId: "project-1",
  targetType: "character",
  targetId: "character-entity-1",
  storageKey: "generated/project-1/asset.png",
  mime: "image/png",
  bytes: 128,
  providerId: "aliyun",
  model: "wanx2.1-t2i-turbo",
  prompt: "portrait",
  selectedAt: 123,
  createdAt: 100,
  downloadUrl: "/api/generated-assets/asset-abcdef123456",
}

test("EXPORT-V2.1 清单使用真实项目名并补齐意图、视觉宪法和判断日志", () => {
  const manifest = buildProjectPackageManifest({
    project: { id: "project-1", title: "快递员的最后一单", createdAt: 1, updatedAt: 2 },
    mode: "delivery",
    exportedAt: 999,
    projectSettings: {
      genre: "悬疑",
      episodeCount: 6,
      brief: { emotion: "克制", audience: "25-35 女性", references: "漫长的季节", redline: "不要爽剧化" },
      look: { palette: "冷蓝、低饱和", light: "顶光", lens: "长焦", banned: "霓虹" },
      judgments: [{ id: "j1", at: 2, step: "characters", action: "换一个角色", reason: "动机太弱" }],
    },
    story: { idea: "一个快递员继承秘密", characters: [], acts: [], episodes: [] },
    assets: { visuals: [], places: [], scenes: [], shots: [shot] },
    refs: [],
    keyframes: [asset],
    tasks: [],
    snapshots: [],
    files: [],
    warnings: [],
  })

  assert.equal(manifest.schema, "chengju.project")
  assert.equal(manifest.schemaVersion, 2)
  assert.equal(manifest.mode, "delivery")
  assert.equal(manifest.project.title, "快递员的最后一单")
  assert.equal(manifest.projectSettings.brief.redline, "不要爽剧化")
  assert.equal(manifest.projectSettings.look.palette, "冷蓝、低饱和")
  assert.equal(manifest.projectSettings.judgments.length, 1)
})

test("EXPORT-V2.2 路径保留中文、去除非法字符并处理重名", () => {
  assert.equal(safePathSegment("林远 / 正面:01"), "林远-正面-01")
  assert.equal(safePathSegment("../", "未命名"), "未命名")
  assert.equal(safePathSegment("示例 · 快递员"), "示例-快递员")
  assert.equal(safeProjectFileStem('剧/名:*?"<>|'), "剧-名")

  const used = new Set<string>()
  assert.equal(uniqueArchivePath("generated/角色/林远.png", used), "generated/角色/林远.png")
  assert.equal(uniqueArchivePath("generated/角色/林远.png", used), "generated/角色/林远-2.png")
  assert.equal(uniqueArchivePath("generated/角色/林远.png", used), "generated/角色/林远-3.png")
})

test("EXPORT-V2.3 生成图路径按角色、地点、集镜号组织，可区分采用与历史", () => {
  assert.equal(
    keyframeArchivePath(asset, {
      mode: "delivery",
      selected: true,
      folder: "characters/林远",
      label: "定妆图",
    }),
    "generated/selected/characters/林远/定妆图.png",
  )
  assert.equal(
    keyframeArchivePath({ ...asset, selectedAt: null, targetType: "shot", targetId: "shot-entity-1" }, {
      mode: "backup",
      selected: false,
      folder: "shots/episode-01",
      label: "第01镜-天台",
    }),
    "generated/history/shots/episode-01/第01镜-天台-候选-asset-abcdef123456.png",
  )
})

test("EXPORT-V2.4 导出报告记录成功、缺失与模式", () => {
  const report = buildExportReport({
    mode: "backup",
    exportedAt: 999,
    files: [{ path: "project.json", kind: "document", bytes: 20 }],
    missing: [
      { kind: "keyframe", label: "林远定妆图", path: "generated/history/characters/林远/候选.png", reason: "下载失败" },
    ],
    warnings: ["1 张历史候选图缺失"],
  })

  assert.equal(report.schema, "chengju.export-report")
  assert.equal(report.mode, "backup")
  assert.equal(report.files.length, 1)
  assert.equal(report.missing[0].reason, "下载失败")
  assert.match(report.summary, /1 个文件/)
})

test("EXPORT-V2.4b 可选数组和提醒缺省时不报错", () => {
  const manifest = buildProjectPackageManifest({
    project: { id: "p" },
    mode: "delivery",
    exportedAt: 1,
    projectSettings: {
      genre: "none",
      episodeCount: 0,
      brief: { emotion: "", audience: "", references: "", redline: "" },
      look: { palette: "", light: "", lens: "", banned: "" },
      judgments: [],
    },
    story: {},
    assets: {},
    refs: [],
  })
  assert.deepEqual(manifest.keyframes, [])
  assert.deepEqual(manifest.tasks, [])
  assert.deepEqual(manifest.snapshots, [])
  assert.deepEqual(manifest.files, [])
  assert.deepEqual(manifest.warnings, [])
  assert.equal(buildExportReport({ mode: "delivery", exportedAt: 1, files: [] }).missing.length, 0)
  assert.equal(
    keyframeArchivePath(
      { ...asset, mime: "image/gif" },
      { mode: "delivery", selected: true, folder: "misc", label: "动图" },
    ),
    "generated/selected/misc/动图.bin",
  )
})

test("EXPORT-V2.5 CSV 带地点、衔接、缺失参考、实体 id 与采用图路径", () => {
  const csv = shotsToCsv([shot], {
    keyframePathByTargetId: { "shot-entity-1": "generated/selected/shots/episode-01/第01镜.png" },
  })
  for (const header of ["地点", "接下一镜首帧", "缺失参考", "镜头实体 ID", "已采用图路径"]) {
    assert.ok(csv.includes(header), `CSV 缺少 ${header}`)
  }
  assert.ok(csv.includes("旧仓库"))
  assert.ok(csv.includes("是"))
  assert.ok(csv.includes("苏婉"))
  assert.ok(csv.includes("generated/selected/shots/episode-01/第01镜.png"))
})

test("EXPORT-V2.6 离线 storyboard 展示视觉宪法、地点锚点和采用图", () => {
  const html = buildStoryboardHtml({
    title: "快递员",
    visuals: [],
    places: [{
      id: "place-1",
      name: "旧仓库",
      space: "水泥柱",
      props: "铁皮柜",
      lighting: "冷白顶灯",
      grade: "青灰",
      anchor: "space: 水泥柱, lighting: 冷白顶灯",
    }],
    look: { palette: "冷蓝", light: "顶光", lens: "长焦", banned: "霓虹" },
    scenes: [],
    shots: [shot],
    images: [{
      path: "generated/selected/shots/episode-01/第01镜.png",
      targetType: "shot",
      targetId: "shot-entity-1",
      alt: "第 1 镜首帧",
    }],
  })

  assert.ok(html.includes("视觉宪法"))
  assert.ok(html.includes("地点视觉锚点"))
  assert.ok(html.includes("水泥柱"))
  assert.ok(html.includes("../generated/selected/shots/episode-01/第01镜.png"))
  assert.ok(html.includes("已出图") || html.includes("需返修"))
  assert.ok(!/src=["']https?:/.test(html))
})

test("EXPORT-V2.7 页面接线真实标题、项目设置、双模式、报告和可读路径", () => {
  const page = fs.readFileSync("app/page.tsx", "utf8")
  const bar = fs.readFileSync("components/ProjectBar.tsx", "utf8")
  const api = fs.readFileSync("app/api/export/route.ts", "utf8")
  const css = fs.readFileSync("app/globals.css", "utf8")

  assert.ok(page.includes("project?.title"))
  assert.ok(page.includes("projectSettings:"))
  assert.ok(page.includes("brief,"))
  assert.ok(page.includes("look,"))
  assert.ok(page.includes("judgments,"))
  assert.ok(page.includes("buildExportReport"))
  assert.ok(page.includes("generated/history/"))
  assert.ok(page.includes("safeProjectFileStem"))
  assert.ok(bar.includes("onBackup(\"delivery\")"))
  assert.ok(bar.includes("onBackup(\"backup\")"))
  assert.ok(bar.includes("导出交付包"))
  assert.ok(bar.includes("导出完整备份"))
  assert.ok(bar.includes("导入项目包"))
  assert.ok(bar.includes("project-export-actions"))
  assert.ok(css.includes("grid-template-columns: repeat(2, minmax(0, 1fr))"))
  assert.ok(api.includes("buildProjectPackageManifest"))
  assert.ok(api.includes("snapshots"))
})

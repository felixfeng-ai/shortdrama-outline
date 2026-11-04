import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

import { enrichWebProject, webProjectFromDto } from "../lib/app-demo-data.ts"

const NOW = new Date("2026-10-26T10:00:00+08:00").getTime()

function dto(overrides: Partial<{
  id: string
  title: string
  createdAt: number
  updatedAt: number
}> = {}) {
  return {
    id: "project-1",
    title: "回声车站",
    createdAt: NOW - 86_400_000,
    updatedAt: NOW - 5 * 60_000,
    ...overrides,
  }
}

test("SD1 Web 项目使用真实标题、更新时间和待开始空态", () => {
  const project = webProjectFromDto(dto(), NOW)
  assert.equal(project.id, "project-1")
  assert.equal(project.title, "回声车站")
  assert.equal(project.source, "web")
  assert.equal(project.episodeLabel, "第 1 集")
  assert.equal(project.scene, "尚未生成场次")
  assert.equal(project.shot, "尚未分镜")
  assert.equal(project.stepCount, "0 个镜头")
  assert.match(project.status, /5 分钟前/)
})

test("SD2 最新快照映射到首页场次、台词、镜号与工作台内容", () => {
  const project = webProjectFromDto(dto(), NOW)
  const enriched = enrichWebProject(
    project,
    [
      { id: "ep-3", number: 3, title: "末班车", synopsis: "顾遥在雨夜追上末班车。", hook: "车票上的名字不是她。" },
    ],
    [
      { id: "scene-2", number: 2, episode: 3, location: "旧车站雨棚", timeOfDay: "夜", summary: "两人隔着一盏坏灯对峙。", characters: ["顾遥", "周沉"] },
    ],
    [
      {
        id: "shot-9", entityId: "shot-entity-9", shot: 9, episode: 3, scene: "旧车站雨棚",
        characters: ["顾遥", "周沉"], action: "顾遥把湿透的车票压在灯箱下。",
        speaker: "顾遥", dialogue: "你等的不是我。", shotSize: "近景", camera: "固定",
        prompt: "rainy station", place: "旧车站雨棚", refImages: [], missingRefFor: [],
        params: { ratio: "9:16", duration: 5, lastFrame: false }, status: "todo",
      },
    ],
  )
  assert.equal(enriched.episode, "EP03")
  assert.equal(enriched.episodeLabel, "第 3 集")
  assert.equal(enriched.scene, "旧车站雨棚")
  assert.equal(enriched.shot, "第 9 镜")
  assert.equal(enriched.stepCount, "1 个镜头")
  assert.match(enriched.quote, /你等的不是我/)
  assert.match(enriched.workLead, /湿透的车票/)
  assert.match(enriched.decision, /顾遥/)
})

test("SD3 App Demo 接入同源项目与快照 API，并区分真实项目和示例", () => {
  const source = fs.readFileSync("components/DoubaoStyleAgentApp.tsx", "utf8")
  assert.ok(source.includes("listProjects"), "没有读取 Web 项目列表")
  assert.ok(source.includes("listSnapshots"), "没有读取项目快照")
  assert.ok(source.includes("Web 项目"), "没有区分真实项目")
  assert.ok(source.includes("界面示例"), "示例项目没有明确标记")
  assert.ok(source.includes("打开完整工作台"), "没有进入真实工作台的路径")
  assert.ok(source.includes("project=${encodeURIComponent"), "工作台链接没有携带项目 id")
})

test("SD4 完整工作台读取 project 查询参数", () => {
  const source = fs.readFileSync("app/page.tsx", "utf8")
  assert.ok(source.includes('searchParams.get("project")'), "完整工作台没有读取 project 参数")
  assert.ok(source.includes("requestedProjectId"), "恢复项目时没有使用 URL 指定项目")
})

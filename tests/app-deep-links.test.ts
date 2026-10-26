import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

import {
  readProjectQuery,
  readStepQuery,
  withProjectQuery,
  withStepQuery,
} from "../lib/app-nav.ts"
import { PWA_MANIFEST } from "../lib/pwa.ts"

test("D1 只接受六个合法步骤，非法值回落 null", () => {
  assert.equal(readStepQuery("?step=visuals"), "visuals")
  assert.equal(readStepQuery("?theme=neutral&step=shots"), "shots")
  assert.equal(readStepQuery("?step=unknown"), null)
  assert.equal(readStepQuery(""), null)
})

test("D2 更新步骤时保留 theme 等其他参数", () => {
  assert.equal(withStepQuery("?theme=neutral", "visuals"), "?theme=neutral&step=visuals")
  assert.equal(withStepQuery("?theme=neutral&step=acts", "shots"), "?theme=neutral&step=shots")
})

test("D4 项目深链只接受合法项目 id", () => {
  const projectId = "7e76084c-879f-4c74-bb1a-8df6f9871a10"
  assert.equal(readProjectQuery(`?project=${projectId}&step=visuals`), projectId)
  assert.equal(readProjectQuery("?project=not-a-project"), null)
  assert.equal(readProjectQuery("?project="), null)
  assert.equal(readProjectQuery("?step=shots"), null)
})

test("D5 项目参数更新时保留步骤与主题，清空时移除参数", () => {
  const projectId = "7e76084c-879f-4c74-bb1a-8df6f9871a10"
  assert.equal(
    withProjectQuery("?theme=neutral&step=visuals", projectId),
    `?theme=neutral&step=visuals&project=${projectId}`,
  )
  assert.equal(
    withProjectQuery(`?theme=neutral&step=visuals&project=${projectId}`, null),
    "?theme=neutral&step=visuals",
  )
})

test("D3 PWA 包含三个步骤快捷方式", () => {
  assert.deepEqual(
    PWA_MANIFEST.shortcuts.map((item) => item.url),
    ["/?step=characters", "/?step=visuals", "/?step=shots"],
  )
})

test("D1/D2 页面初始化、点击与前进后退都同步 URL", () => {
  const page = fs.readFileSync("app/page.tsx", "utf8")
  const projectBar = fs.readFileSync("components/ProjectBar.tsx", "utf8")
  assert.ok(page.includes("readStepQuery"), "页面没有读取深链接")
  assert.ok(page.includes("withStepQuery"), "步骤切换没有更新 URL")
  assert.ok(page.includes("popstate"), "没有处理浏览器前进后退")
  assert.ok(page.includes("pushState"), "步骤切换没有写入历史")
  assert.ok(page.includes("readProjectQuery"), "页面没有读取项目深链")
  assert.ok(page.includes("withProjectQuery"), "项目切换没有同步 URL")
  assert.ok(page.includes("replaceState"), "项目初始化没有修正 URL")
  assert.ok(projectBar.includes("复制项目链接"), "项目条没有分享入口")
})

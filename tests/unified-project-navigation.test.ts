import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

import {
  canvasHref,
  readCanvasQuery,
  skillsHref,
  withCanvasQuery,
  workspaceHref,
} from "../lib/app-nav.ts"

const projectId = "7e76084c-879f-4c74-bb1a-8df6f9871a10"

test("NP1 画布开关是 URL 状态，并保留项目、步骤和其他参数", () => {
  assert.equal(readCanvasQuery("?view=canvas"), true)
  assert.equal(readCanvasQuery("?project=x&step=shots&view=canvas"), true)
  assert.equal(readCanvasQuery("?view=workbench"), false)
  assert.equal(readCanvasQuery(""), false)
  assert.equal(
    withCanvasQuery(`?project=${projectId}&step=episodes&theme=neutral`, true),
    `?project=${projectId}&step=episodes&theme=neutral&view=canvas`,
  )
  assert.equal(
    withCanvasQuery(`?project=${projectId}&step=episodes&theme=neutral&view=canvas`, false),
    `?project=${projectId}&step=episodes&theme=neutral`,
  )
})

test("NP2 三个入口共用项目与步骤，不把 Skill 的画布链接固定到分镜", () => {
  assert.equal(
    workspaceHref(projectId, "episodes"),
    `/?project=${projectId}&step=episodes`,
  )
  assert.equal(
    skillsHref(projectId, "episodes"),
    `/skills?project=${projectId}&step=episodes`,
  )
  assert.equal(
    canvasHref(projectId, "episodes"),
    `/?project=${projectId}&step=episodes&view=canvas`,
  )
  assert.equal(workspaceHref(null, "episodes"), "/?step=episodes")
  assert.equal(skillsHref(null, "episodes"), "/skills?step=episodes")
  assert.equal(canvasHref(null, "episodes"), "/?step=episodes&view=canvas")
})

test("NP3 工作台从 URL 恢复画布，打开/关闭与步骤跳转都更新历史", () => {
  const page = fs.readFileSync("app/page.tsx", "utf8")

  assert.ok(page.includes("readWorkspaceModeQuery"), "工作台没有读取模式深链")
  assert.ok(page.includes("withWorkspaceModeQuery"), "模式切换没有同步 URL")
  assert.ok(page.includes("const openWorkspaceMode"), "缺少统一模式切换入口")
  assert.ok(page.includes("const openCanvas"), "缺少统一打开画布入口")
  assert.ok(page.includes("const closeCanvas"), "缺少统一关闭画布入口")
  assert.ok(page.includes("openCanvas('graph')"), "画布入口没有复用统一函数")
  assert.ok(page.includes("const goWorkspaceHome"), "画布返回没有复用统一首页函数")
  assert.ok(page.includes("goWorkspaceHome()"), "画布返回没有复用统一函数")
  assert.ok(page.includes("pushState"), "画布开关没有写入浏览器历史")
  assert.ok(page.includes("readStepQuery"), "画布返回没有恢复当前步骤")
})

test("NP4 Skill 导航保留当前项目与步骤，画布链接真的打开画布", () => {
  const catalog = fs.readFileSync("components/SkillCatalog.tsx", "utf8")

  assert.ok(catalog.includes("readStepQuery"), "Skill 页没有读取当前步骤")
  assert.ok(catalog.includes("skillsHref"), "Skill 导航没有复用统一路由")
  assert.ok(catalog.includes("workspaceHref"), "返回工作台没有保留步骤")
  assert.ok(catalog.includes("canvasHref"), "画布入口没有复用统一路由")
  assert.ok(!catalog.includes("&step=shots` : `/?step=shots"), "画布入口仍固定跳到分镜")
})

test("NP5 画布内嵌复用真实编排画布并保留项目上下文", () => {
  const page = fs.readFileSync("app/page.tsx", "utf8")
  const css = fs.readFileSync("app/workspace-shell.css", "utf8")
  const skillsCss = fs.readFileSync("app/skills/skills.css", "utf8")

  assert.ok(page.includes("<CanvasGraphWorkspace"), "画布没有复用真实编排画布")
  assert.ok(page.includes("projectTitle={workspaceProjectTitle}"), "页面没有把项目名传给画布")
  assert.ok(page.includes("<WorkspaceTopbar"), "画布没有保留统一顶栏")
  assert.ok(css.includes(".wfx-canvas-frame"), "缺少内嵌画布容器样式")
  assert.ok(skillsCss.includes(".skill-page .top-nav a"), "Skill 导航样式丢失")
  assert.ok(skillsCss.includes("min-height: 44px"), "导航触控目标不足 44px")
})

import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

import {
  readAppTabQuery,
  withAppTabQuery,
  withoutAppTabQuery,
} from "../lib/app-nav.ts"
import { PWA_MANIFEST } from "../lib/pwa.ts"

test("M1 只接受四个 App 页签，非法值不启用 App 外壳", () => {
  assert.equal(readAppTabQuery("?app=agent"), "agent")
  assert.equal(readAppTabQuery("?step=shots&app=projects"), "projects")
  assert.equal(readAppTabQuery("?app=tasks"), "tasks")
  assert.equal(readAppTabQuery("?app=me"), "me")
  assert.equal(readAppTabQuery("?app=unknown"), null)
  assert.equal(readAppTabQuery(""), null)
})

test("M2 App 页签写入 URL 时保留步骤与主题参数", () => {
  assert.equal(
    withAppTabQuery("?theme=neutral&step=shots", "agent"),
    "?theme=neutral&step=shots&app=agent",
  )
  assert.equal(
    withAppTabQuery("?app=agent&step=visuals", "projects"),
    "?app=projects&step=visuals",
  )
  assert.equal(
    withoutAppTabQuery("?theme=neutral&app=agent&step=shots"),
    "?theme=neutral&step=shots",
  )
})

test("M3 已安装 PWA 默认从场记启动", () => {
  assert.equal(PWA_MANIFEST.start_url, "/?app=agent")
})

test("M4 App 外壳提供四入口并复用现有业务组件", () => {
  const source = fs.readFileSync("components/MobileAppShell.tsx", "utf8")
  for (const label of ["Agent", "项目", "任务", "我的"]) {
    assert.ok(source.includes(label), `缺少 ${label} 入口`)
  }
  assert.ok(source.includes("AgentDock"), "场记页没有复用 AgentDock")
  assert.ok(source.includes("GenerationTaskPanel"), "任务页没有复用生成任务中心")
  assert.ok(source.includes("QuotaBar"), "我的页没有复用真实额度")
  assert.ok(source.includes("onSwitchProject"), "项目页没有接项目切换")
  assert.ok(source.includes("aria-current"), "当前页签缺少无障碍状态")
  assert.ok(source.includes("min-h-[48px]"), "底部导航触控目标小于 48px")
})

test("M5 页面只在合法 app 参数下选择 App 外壳", () => {
  const source = fs.readFileSync("app/page.tsx", "utf8")
  assert.ok(source.includes("readAppTabQuery"), "页面没有读取 App 页签")
  assert.ok(source.includes("withAppTabQuery"), "切换页签没有同步 URL")
  assert.ok(source.includes("withoutAppTabQuery"), "进入工作台没有退出 App 模式")
  assert.ok(source.includes("<MobileAppShell"), "页面没有挂载 App 外壳")
  assert.ok(source.includes("appMode"), "页面没有按 URL 区分 App 模式")
})

test("M6 App 外壳使用安全区，并有 reduced-motion 兜底", () => {
  const css = fs.readFileSync("app/globals.css", "utf8")
  assert.ok(css.includes(".mobile-app-shell"), "缺少 App 外壳样式")
  assert.ok(css.includes("100dvh"), "App 外壳没有使用动态视口高度")
  assert.ok(css.includes("env(safe-area-inset-bottom)"), "底部导航没有避让安全区")
  assert.ok(css.includes(".mobile-app-main"), "缺少避开底部导航的内容区")
  assert.ok(
    /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*mobile-app/.test(css),
    "App 外壳缺少 reduced-motion 兜底",
  )
})

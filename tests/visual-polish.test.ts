import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

const auth = fs.readFileSync("components/AuthButton.tsx", "utf8")
const login = fs.readFileSync("components/LoginPanel.tsx", "utf8")
const loginPage = fs.readFileSync("app/login/page.tsx", "utf8")
const shellCss = fs.readFileSync("app/workspace-shell.css", "utf8")
const skillsCss = fs.readFileSync("app/skills/skills.css", "utf8")
const globalsCss = fs.readFileSync("app/globals.css", "utf8")
const plan = fs.readFileSync("components/SkillExecutionPlan.tsx", "utf8")
const quotaBar = fs.readFileSync("components/QuotaBar.tsx", "utf8")

test("VP1 顶栏头像使用独立 30px 容器，内部层填满且无横向偏移", () => {
  assert.match(shellCss, /\.wfx-topbar \.h-install\s*\{[^}]*padding:\s*0;/s)
  assert.match(shellCss, /\.wfx-topbar \.h-install \.wfx-user-initial\s*\{[^}]*width:\s*100%;[^}]*height:\s*100%;/s)
  assert.match(shellCss, /\.wfx-topbar \.h-install \.wfx-user-initial\s*\{[^}]*place-items:\s*center;/s)
})

test("VP2 登录页切换冷蓝/反相白主题并更新核心优势文案", () => {
  assert.match(login, /把判断留在创作里/)
  assert.match(login, /跨镜一致性/)
  assert.match(login, /Canon/)
  assert.match(login, /确认后写入新版本/)
  assert.match(loginPage, /人的判断/)
  assert.match(shellCss, /\.auth-page\s*\{[^}]*--signal-acid:\s*#8dc8dc/s)
  assert.doesNotMatch(login, /把故事<span className="auth-title-accent">做对/)
})

test("VP3 旧绿色聚焦态已替换为冷蓝单层提示", () => {
  assert.doesNotMatch(skillsCss, /rgba\(196,\s*217,\s*138/)
  assert.match(skillsCss, /outline:\s*1px solid rgba\(141,\s*200,\s*220/)
  assert.match(shellCss, /\.auth-field:focus-within/)
  assert.match(shellCss, /var\(--wfx-accent\)/)
})

test("VP4 内测界面采用今日创作额度，不误称积分", () => {
  assert.match(quotaBar, /今日创作额度|创作额度/)
  assert.doesNotMatch(quotaBar, />额度 \$\{/)
  const visibleSources = login + quotaBar + plan
  assert.match(visibleSources, /创作额度/)
})

test("VP5 右侧执行计划改单列并取消宽版侧栏分隔", () => {
  assert.match(shellCss, /\.wfx-create \.studio-skill-plan \.execution-plan-layout\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s)
  assert.match(shellCss, /\.wfx-create \.studio-skill-plan \.execution-plan-side\s*\{[^}]*border-left:\s*0;/s)
  assert.match(plan, /execution-plan-steps/)
  assert.match(plan, /execution-plan-side/)
})

test("VP6 深色工作区的强调斜面改用冷蓝，不再从旧主题继承绿色", () => {
  assert.match(shellCss, /--c-accent-50:\s*19\s+38\s+44;/)
  assert.match(shellCss, /--c-accent-500:\s*141\s+200\s+220;/)
  assert.match(shellCss, /--c-accent-600:\s*121\s+179\s+198;/)
  assert.doesNotMatch(globalsCss, /#c4d98a|rgba\(196,\s*217,\s*138|rgba\(185,\s*243,\s*90/i)
  assert.doesNotMatch(globalsCss, /background:\s*#263321/i)
})

test("VP7 创作主输入框聚焦时不显示额外边框线", () => {
  assert.match(skillsCss, /\.skill-page \.composer textarea:focus-visible\s*\{[^}]*outline:\s*none;/s)
  assert.match(
    skillsCss,
    /\.skill-page \.composer:focus-within\s*\{[^}]*border-color:\s*var\(--line\);[^}]*background:\s*var\(--panel\);/s,
  )
  assert.match(
    skillsCss,
    /\.skill-page-embedded \.composer:focus-within\s*\{[^}]*border-color:\s*var\(--line\);[^}]*background:\s*var\(--panel\);/s,
  )
})

import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

function read(path: string): string {
  return fs.readFileSync(path, "utf8")
}

test("LEGAL1 法务页覆盖内测隐私、AI 内容、香港部署与举报", () => {
  const page = read("app/legal/page.tsx")

  assert.match(page, /内测条款与隐私说明/)
  assert.match(page, /香港特别行政区/)
  assert.match(page, /本地参考图/)
  assert.match(page, /AI 生成/)
  assert.match(page, /禁止内容/)
  assert.match(page, /用户权利/)
  assert.match(page, /support@chenju\.work/)
  assert.match(page, /2026 年 11 月 4 日/)
  assert.doesNotMatch(page, /ICP备案号/)
})

test("LEGAL2 首页启用统一法务页脚", () => {
  const home = read("app/page.tsx")
  const footer = read("components/SiteLegalFooter.tsx")
  const css = read("app/globals.css")

  assert.match(home, /import SiteLegalFooter from '@\/components\/SiteLegalFooter'/)
  assert.match(home, /<SiteLegalFooter\s*\/>/)
  for (const link of ["/legal#terms", "/legal#privacy", "/legal#ai", "/report"]) {
    assert.ok(footer.includes(`href="${link}"`))
  }
  assert.match(footer, /mailto:support@chenju\.work/)
  assert.match(footer, /© 2026 VeyaTV/)
  assert.match(css, /\.site-legal-footer/)
})

test("LEGAL3 登录页要求明确同意并可打开协议", () => {
  const login = read("components/LoginPanel.tsx")
  const css = read("app/globals.css")

  assert.match(login, /继续即表示/)
  assert.match(login, /《用户协议》/)
  assert.match(login, /《隐私政策》/)
  assert.match(login, /href="\/legal#terms"/)
  assert.match(login, /href="\/legal#privacy"/)
  assert.equal((login.match(/className="auth-consent"/g) ?? []).length, 1)
  assert.match(css, /\.signal-desk \.auth-consent/)
})

test("LEGAL4 举报页说明人工核查与反馈，不承诺固定时限", () => {
  const report = read("app/report/page.tsx")

  assert.match(report, /项目名称[\s\S]*项目链接/)
  assert.match(report, /人工核查/)
  assert.match(report, /反馈/)
  assert.doesNotMatch(report, /24\s*小时|48\s*小时|7\s*个工作日/)
})

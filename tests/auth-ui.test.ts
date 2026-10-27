import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

test("登录使用独立页面，不再覆盖工作台弹层", () => {
  const page = fs.readFileSync("app/page.tsx", "utf8")
  const button = fs.readFileSync("components/AuthButton.tsx", "utf8")
  assert.ok(page.includes("<AuthButton"))
  assert.ok(button.includes("/login"))
  assert.ok(!button.includes('role="dialog"'))
  assert.ok(!button.includes('className="fixed inset-0'))
})

test("独立登录页包含返回、表单、倒计时和错误恢复", () => {
  const route = fs.readFileSync("app/login/page.tsx", "utf8")
  const panel = fs.readFileSync("components/LoginPanel.tsx", "utf8")
  const client = fs.readFileSync("lib/auth/client.ts", "utf8")
  assert.ok(route.includes("<LoginPanel"))
  assert.ok(panel.includes("<form"))
  assert.ok(panel.includes("返回工作台"))
  assert.ok(panel.includes("邮箱验证码"))
  assert.ok(panel.includes("修改邮箱"))
  assert.ok(panel.includes("重新获取"))
  assert.ok(panel.includes("autoComplete"))
  assert.ok(panel.includes('aria-live="polite"'))
  assert.ok(panel.includes("window.location.assign"))
  assert.ok(panel.includes("退出登录"))
  assert.ok(panel.includes("活跃设备"))
  assert.ok(panel.includes("fetchAuthSessions"))
  assert.ok(panel.includes("revokeAuthSession"))
  assert.ok(panel.includes("requestEmailAuthCode"))
  assert.ok(panel.includes("verifyEmailAuthCode"))
  assert.ok(panel.includes('type="email"'))
  assert.ok(!panel.includes("修改手机号"), "Web 登录页不能继续把手机号当作默认登录方式")
  assert.ok(client.includes("/api/auth/email/request-code"))
  assert.ok(client.includes("/api/auth/email/verify-code"))
  assert.ok(client.includes("email: string | null"))
})

test("顶栏账号入口不假定用户一定有手机号", () => {
  const button = fs.readFileSync("components/AuthButton.tsx", "utf8")
  assert.ok(button.includes("user.displayName"))
  assert.ok(!button.includes("user.phone.slice"))
})

test("登录后返回路径只允许站内地址", () => {
  const helper = fs.readFileSync("lib/auth/return-to.ts", "utf8")
  assert.ok(helper.includes("startsWith(\"/\")"))
  assert.ok(helper.includes("startsWith(\"//\")"))
  assert.ok(helper.includes("return \"/\""))
})

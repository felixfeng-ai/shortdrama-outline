import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

test("管理员后台提供总览、用户额度、Web Vitals 与审计", () => {
  const page = fs.readFileSync("app/admin/page.tsx", "utf8")
  const css = fs.readFileSync("app/admin/admin.css", "utf8")
  for (const text of [
    "运营总览",
    "用户与额度",
    "Web Vitals",
    "最近管理操作",
    "临时额外额度",
    "撤销额度",
  ]) {
    assert.ok(page.includes(text), `后台缺少 ${text}`)
  }
  for (const endpoint of [
    "/api/admin/summary",
    "/api/admin/users",
    "/api/admin/quota-overrides",
    "/api/admin/vitals",
  ]) {
    assert.ok(page.includes(endpoint), `后台未接入 ${endpoint}`)
  }
  assert.match(page, /当前账号没有管理员权限/)
  assert.match(page, /暂无性能样本/)
  assert.match(css, /@media \(max-width: 760px\)/)
  assert.match(css, /:focus-visible/)
  assert.match(css, /prefers-reduced-motion/)
})

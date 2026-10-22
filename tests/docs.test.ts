import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

const readme = fs.readFileSync("README.md", "utf8")

test("D1 README 不写死会过期的测试数量", () => {
  assert.ok(!/tests-\d+_passing/.test(readme), "测试徽章不应写死数量")
  assert.ok(!/\b165\b/.test(readme), "README 仍保留旧的 165 条测试数量")
})

test("D2 多项目切换必须标为已完成", () => {
  assert.ok(!readme.includes("多项目切换界面 | 📋 计划中"))
  assert.ok(readme.includes("多项目切换界面 | ✅ 已完成"))
})

test("D3 刷新数据说明必须与匿名会话持久化一致", () => {
  assert.ok(!readme.includes("刷新页面数据没了"))
  assert.ok(!readme.includes("纯前端状态，没有数据库"))
  assert.ok(readme.includes("当前浏览器的匿名会话"))
  assert.ok(readme.includes("导出备份"))
})

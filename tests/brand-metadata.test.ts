import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

test("品牌元数据以 VeyaFrame 为最新名称并引用新图标", () => {
  const layout = fs.readFileSync("app/layout.tsx", "utf8")
  const legal = fs.readFileSync("app/legal/page.tsx", "utf8")
  const report = fs.readFileSync("app/report/page.tsx", "utf8")
  const icon = fs.readFileSync("public/veyaframe-icon.svg", "utf8")

  assert.match(layout, /title:\s*'VeyaFrame · AI 短剧与漫剧创作工作台'/)
  assert.match(layout, /siteName:\s*'VeyaFrame'/)
  assert.match(layout, /title:\s*'VeyaFrame'/)
  assert.match(layout, /icon:\s*'\/veyaframe-icon\.svg'/)
  assert.match(layout, /apple:\s*'\/veyaframe-icon\.svg'/)
  assert.match(legal, /内测条款与隐私说明 · VeyaFrame/)
  assert.match(report, /内容举报 · VeyaFrame/)

  assert.match(icon, /fill="#13171A"/)
  assert.match(icon, /stroke="#C4D98A"/)
  assert.doesNotMatch(icon, />剧</)
})

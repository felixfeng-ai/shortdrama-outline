import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

test("品牌元数据以 VeyaTV 为最新名称并引用新图标", () => {
  const layout = fs.readFileSync("app/layout.tsx", "utf8")
  const legal = fs.readFileSync("app/legal/page.tsx", "utf8")
  const report = fs.readFileSync("app/report/page.tsx", "utf8")
  const icon = fs.readFileSync("public/veyatv-icon.svg", "utf8")

  assert.match(layout, /title:\s*'VeyaTV · AI 短剧与漫剧生产平台'/)
  assert.match(layout, /siteName:\s*'VeyaTV'/)
  assert.match(layout, /title:\s*'VeyaTV'/)
  assert.match(layout, /icon:\s*'\/veyatv-icon\.svg'/)
  assert.match(layout, /apple:\s*'\/veyatv-icon\.svg'/)
  assert.match(legal, /内测条款与隐私说明 · VeyaTV/)
  assert.match(report, /内容举报 · VeyaTV/)

  assert.match(icon, /fill="#08090A"/)
  assert.match(icon, /stroke="#F0F2EF"/)
  assert.doesNotMatch(icon, />剧</)
})

import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

function read(path: string): string {
  return fs.readFileSync(path, "utf8")
}

test("LOGO1 主 Logo 使用同一实心负形路径并保持单色", () => {
  const component = read("components/VeyaBrandMark.tsx")
  const wordmark = read("components/VeyaWordmark.tsx")
  const appIcon = read("app/icon.svg")
  const pwaIcon = read("public/veyatv-icon.svg")
  const path = /M5 5h22v22H5zm4 4v14h4l3-9 3 9h4V9h-4l-3 8-3-8z/

  assert.match(component, path)
  assert.match(component, /fill="currentColor"/)
  assert.match(component, /fillRule="evenodd"/)
  assert.match(wordmark, />Veya</)
  assert.match(wordmark, /veya-wordmark-tv">TV</)
  assert.match(appIcon, /fill-rule="evenodd"/)
  assert.match(appIcon, /fill="#F0F2EF"/)
  assert.match(pwaIcon, /fill-rule="evenodd"/)
  assert.match(pwaIcon, /fill="#F0F2EF"/)
  assert.doesNotMatch(component, /<path d="M5 9 15 3/)
  assert.doesNotMatch(appIcon, /<rect x="\.75"/)
})

test("LOGO2 主界面不再把成剧或 AI 标签拼进 VeyaTV 主品牌", () => {
  const files = [
    "components/WorkspaceSidebar.tsx",
    "components/LoginPanel.tsx",
    "components/DocsGuide.tsx",
    "components/SkillCatalog.tsx",
    "components/ProjectReview.tsx",
    "components/SiteLegalFooter.tsx",
    "app/app/page.tsx",
    "app/legal/page.tsx",
    "app/report/page.tsx",
  ]

  for (const file of files) {
    const content = read(file)
    assert.doesNotMatch(content, /成剧/, `${file} 仍把成剧放进主品牌露出`)
  }
})

import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

const CRITICAL_MODULES = [
  "components/WorkspaceOnboarding.tsx",
  "components/QuickTrialProgress.tsx",
  "components/VideoGenerationSettings.tsx",
  "components/ShotVideoPanel.tsx",
  "components/BatchVideoPanel.tsx",
  "components/ProductionActionCenter.tsx",
  "components/ImpactPreviewDialog.tsx",
  "lib/video/catalog.ts",
  "lib/video/use-video-capabilities.ts",
  "lib/production-actions.ts",
  "lib/rework/preview.ts",
  "app/api/video/capabilities/route.ts",
]

test("DOC1 通用规则要求关键模块使用中文注释", () => {
  const agents = fs.readFileSync("AGENTS.md", "utf8")
  assert.match(agents, /关键代码模块必须添加中文注释/)
  assert.match(agents, /业务原因、边界条件、失败行为/)
})

test("DOC2 关键模块保留至少一段中文模块注释", () => {
  for (const file of CRITICAL_MODULES) {
    const source = fs.readFileSync(file, "utf8")
    assert.match(
      source,
      /\/\*\*[\s\S]*?[\u4e00-\u9fff][\s\S]*?\*\//,
      `${file} 缺少解释业务边界的模块注释`,
    )
  }
})

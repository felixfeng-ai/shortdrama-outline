import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

test("DO1 镜头预览只在分镜步且有当前镜头时出现", () => {
  const page = fs.readFileSync("app/page.tsx", "utf8")

  assert.ok(page.includes("hasDeckOutput"), "页面没有计算是否存在可预览镜头")
  assert.ok(page.includes("view === 'shots'"), "预览条件没有绑定分镜步骤")
  assert.ok(page.includes("hasDeckOutput && ("), "页签没有按预览条件渲染")
  assert.ok(page.includes("if (!hasDeckOutput)"), "离开分镜后没有回到 Agent")
})

test("DO2 页签命名统一为镜头预览和完整 Agent 品牌", () => {
  const page = fs.readFileSync("app/page.tsx", "utf8")

  assert.ok(page.includes("镜头预览"), "产出页签没有改成有实际含义的镜头预览")
  assert.ok(page.includes("Veya Agent"), "Agent 页签没有使用完整品牌名")
  assert.ok(!page.includes(">\n              产出\n            </button>"), "旧的含糊“产出”页签仍存在")
})

test("DO3 预览只展示镜头产物，不再重复 AI 提问", () => {
  const page = fs.readFileSync("app/page.tsx", "utf8")
  const preview = fs.existsSync("components/ShotPreviewDock.tsx")
    ? fs.readFileSync("components/ShotPreviewDock.tsx", "utf8")
    : ""

  assert.ok(page.includes("<ShotPreviewDock"), "页面没有接入独立镜头预览组件")
  assert.ok(!page.includes("<AssistantDock"), "页面仍挂载重复 AI 提问组件")
  assert.ok(preview.includes("refImages[0]"), "预览没有使用镜头参考图")
  assert.ok(preview.includes("shotSize"), "预览没有显示景别")
  assert.ok(preview.includes("params.ratio"), "预览没有显示画幅")
  assert.ok(preview.includes("params.duration"), "预览没有显示时长")
  assert.ok(preview.includes("action"), "预览没有显示动作摘要")
  assert.ok(preview.includes("dialogue"), "预览没有显示台词摘要")
  assert.ok(!preview.includes("向 AI 提问"), "镜头预览仍包含第二个 AI 提问框")
})

test("DO4 右侧舱页签在窄屏保持可读和 44px 触控高度", () => {
  const css = fs.readFileSync("app/globals.css", "utf8")

  assert.ok(css.includes(".shot-preview-dock"), "缺少镜头预览样式")
  assert.ok(css.includes(".shot-preview-narrative"), "缺少镜头动作/台词摘要样式")
  assert.ok(css.includes(".signal-desk .h-deck-tab"), "缺少右侧舱页签主题样式")
  assert.ok(css.includes("min-height: 44px"), "右侧舱页签或控件不足 44px")
})

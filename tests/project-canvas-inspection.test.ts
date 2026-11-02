import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

test("画布巡检 UI：问题优先、任务覆盖与精确定位全部接线", () => {
  const canvas = fs.readFileSync("components/ProjectCanvas.tsx", "utf8")
  const page = fs.readFileSync("app/page.tsx", "utf8")
  const css = fs.readFileSync("app/globals.css", "utf8")

  assert.ok(canvas.includes("优先处理"))
  assert.ok(canvas.includes("buildCanvasActionQueue"))
  assert.ok(canvas.includes("summarizeCanvasTasks"))
  assert.ok(canvas.includes("fetchProjectGenerationAssets"))
  assert.ok(canvas.includes("onOpenItem"))
  assert.ok(canvas.includes("map-priority"))
  assert.ok(canvas.includes("map-node-task"))
  assert.ok(canvas.includes("listNodes"))
  assert.ok(canvas.includes("priorityExpanded"))
  assert.ok(canvas.includes("展开全部"))
  assert.ok(canvas.includes("previewEpisode"))
  assert.ok(canvas.includes("全部集"))
  assert.ok(page.includes("openCanvasItem"))
  assert.ok(page.includes("data-canvas-item"))
  assert.ok(page.includes("projectId={projectId}"))
  assert.ok(css.includes(".map-priority"))
  assert.ok(css.includes(".map-node-task"))
  assert.ok(css.includes(".signal-desk .map-inspector-foot"))
  assert.ok(css.includes(".signal-desk .map-ask-agent"))
  assert.ok(css.includes(".signal-desk .map-open-step"))
  assert.ok(css.includes("[data-canvas-item]:focus-visible"))
})

test("画布精确定位标记覆盖角色、三幕、分集、场次、定妆、地点和镜头", () => {
  const files = [
    "components/CharacterList.tsx",
    "components/ActList.tsx",
    "components/EpisodeList.tsx",
    "components/SceneList.tsx",
    "components/VisualAnchorPanel.tsx",
    "components/PlacePanel.tsx",
    "components/ShotBoardCard.tsx",
  ]
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8")
    assert.ok(source.includes("data-canvas-item"), `${file} 缺少精确定位标记`)
  }
})

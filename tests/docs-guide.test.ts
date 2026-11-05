import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

test("T1 工作台和创作技能页都有明确教程入口", () => {
  const topbar = fs.readFileSync("components/WorkspaceTopbar.tsx", "utf8")
  const skills = fs.readFileSync("components/SkillCatalog.tsx", "utf8")
  assert.match(topbar, /href="\/docs"/)
  assert.match(topbar, /使用教程/)
  assert.match(skills, /href="\/docs"/)
  assert.match(skills, />教程</)
})

test("T2-T4 教程覆盖平台定位与六步生产链", () => {
  const guide = fs.readFileSync("components/DocsGuide.tsx", "utf8")
  for (const text of [
    "从想法、原文到成片",
    "开始第一次创作",
    "核心人物",
    "三幕大纲",
    "分集",
    "视觉定妆",
    "场次",
    "分镜",
  ]) {
    assert.ok(guide.includes(text), `教程缺少 ${text}`)
  }
})

test("T5-T8 教程覆盖视频、声音、成片和外部交付", () => {
  const guide = fs.readFileSync("components/DocsGuide.tsx", "utf8")
  for (const text of [
    "镜头视频",
    "时间线成片",
    "已采用首帧",
    "TTS",
    "BGM",
    "SRT",
    "MP4",
    "manifest",
    "即梦",
    "可灵",
    "剪映",
  ]) {
    assert.ok(guide.includes(text), `教程缺少 ${text}`)
  }
})

test("T9-T10 教程明确 Agent 与创作技能的确认边界", () => {
  const guide = fs.readFileSync("components/DocsGuide.tsx", "utf8")
  assert.match(guide, /待确认/)
  assert.match(guide, /不会自动创建付费任务/)
  assert.match(guide, /创作技能/)
})

test("教程页面具备三栏文档骨架、CTA 与移动端布局", () => {
  const route = fs.readFileSync("app/docs/page.tsx", "utf8")
  const css = fs.readFileSync("app/docs/docs.css", "utf8")
  const guide = fs.readFileSync("components/DocsGuide.tsx", "utf8")
  assert.match(route, /成剧使用教程/)
  assert.match(guide, /docs-layout/)
  assert.match(guide, /docs-toc/)
  assert.match(guide, /开始第一次创作/)
  assert.match(css, /@media/)
})

test("教程用真实界面截图解释关键生产节点", () => {
  const guide = fs.readFileSync("components/DocsGuide.tsx", "utf8")
  for (const image of [
    "01-quick-start.png",
    "02-visual-assets.png",
    "03-shot-video.png",
    "04-timeline.png",
    "05-export.png",
  ]) {
    assert.ok(guide.includes(image), `教程缺少截图 ${image}`)
    assert.ok(fs.existsSync(`public/docs/tutorial/${image}`), `截图文件不存在：${image}`)
  }
  assert.match(guide, /查看\$\{label\}界面原图/)
  assert.match(guide, /loading="lazy"/)
})

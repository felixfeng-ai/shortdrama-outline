import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

test("SCENE-CLARITY 第五步使用场次剧本术语，不从视觉上伪装成镜头卡", () => {
  const list = fs.readFileSync("components/SceneList.tsx", "utf8")
  const types = fs.readFileSync("lib/types.ts", "utf8")
  const page = fs.readFileSync("app/page.tsx", "utf8")
  const css = fs.readFileSync("app/globals.css", "utf8")

  for (const label of ["场次剧本", "本场剧情", "本场出场", "这一场会拆成多个镜头"]) {
    assert.ok(list.includes(label), `场次卡缺少“${label}”标识`)
  }
  assert.ok(list.includes("场 {scene.number}"), "场次编号没有再明确写出“场”")
  assert.ok(list.includes("第 {scene.episode} 集"), "抬头没有保留明确集号")

  assert.ok(types.includes("title: '生成场次剧本'"), "第五步标题仍使用含糊的“场景”")
  assert.ok(types.includes("nav: '场次'"), "第五步导航仍使用“场景”")
  assert.ok(types.includes("short: '场次'"), "第五步短标签仍使用“场景”")
  assert.ok(
    types.includes("先写一场戏发生了什么，下一步再拆成镜头"),
    "第五步副标题没有解释场次与分镜的关系",
  )
  assert.ok(page.includes('actionLabel="场次剧本"'), "第五步主按钮仍叫“场景”")

  assert.ok(css.includes(".scene-card-head"), "场次卡缺少独立抬头样式")
  assert.ok(css.includes(".scene-card-type"), "场次剧本类型标识缺少样式")
})

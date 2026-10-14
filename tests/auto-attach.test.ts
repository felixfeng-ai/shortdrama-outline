import { test } from "node:test"
import assert from "node:assert/strict"

import { matchByFolder, matchByFolderDetailed, matchFileToCharacter, summarizeAttach, toPinyin, wordGroups, describeMatchKind, looksUninformative } from "../lib/assets/vault.ts"

// ── F6 按目录名自动预挂 ──
//
// 「目录名 == 角色名」看起来是一行 includes，但边界很多：
// 角色名互相包含（林远 / 林远之）、目录名带后缀（林远-定妆）、
// 平铺文件（没有目录）、大小写。这些都得写死，否则会自动挂错图 ——
// 挂错比不挂更糟，因为用户会以为已经垫好图了。

const f = (key: string) => ({ key, name: key.split("/").pop() ?? key, hash: "h", size: 1, mime: "image/png" })

test("F6 目录名等于角色名时命中", () => {
  const hit = matchByFolder([f("林远/正面.png"), f("苏婉/正面.png")], ["林远"])
  assert.equal(hit["林远"]?.length, 1)
  assert.equal(hit["林远"]?.[0], "林远/正面.png")
  assert.equal(hit["苏婉"], undefined)
})

test("F6b 同一角色的多张图全部命中", () => {
  const hit = matchByFolder([f("林远/正面.png"), f("林远/侧面.png")], ["林远"])
  // 顺序按 key 排序保证稳定（同一次扫描两次结果必须一致）
  assert.deepEqual(hit["林远"], ["林远/侧面.png", "林远/正面.png"])
})

test("F6c 目录名带后缀（林远-定妆）也能命中", () => {
  const hit = matchByFolder([f("林远-定妆/正面.png")], ["林远"])
  assert.equal(hit["林远"]?.[0], "林远-定妆/正面.png")
})

test("F6d 平铺在根目录的文件：文件名就是角色名时命中（即梦下载的图就是平铺的）", () => {
  const hit = matchByFolder([f("正面.png"), f("林远.png")], ["林远"])
  assert.deepEqual(hit["林远"], ["林远.png"])
})

test("F6d2 平铺且文件名无角色信息时不挂——宁可让用户手动挂", () => {
  const hit = matchByFolder([f("正面.png"), f("侧面.png")], ["林远"])
  assert.equal(hit["林远"], undefined)
})

test("F6e 嵌套子目录按第一段目录名判定", () => {
  const hit = matchByFolder([f("林远/定妆/正面.png")], ["林远"])
  assert.equal(hit["林远"]?.[0], "林远/定妆/正面.png")
})

test("F6f 只返回命中项，没命中的角色不出现在结果里（避免覆盖用户手挂的）", () => {
  const hit = matchByFolder([f("苏婉/正面.png")], ["林远", "苏婉"])
  assert.equal(hit["林远"], undefined)
  assert.equal(hit["苏婉"]?.length, 1)
})

// ── F7 拼音折叠：即梦下载的真实命名 ──────────────────────────
//
// 这是用户实际遇到的场景（2026-10-14 实测数据，见 README 的「命名不用改」一节）：
//   目录写法：JIAN NAN/简南_定妆照.png      —— 目录是拼音大写，文件名是中文
//   平铺写法：jimeng-...-34-year-old woman Jiang Nan, long face w....png
//              —— 即梦默认下载名，角色名夹在描述中间
// 前者靠中文命中，后者必须靠「空格分隔的拼音单词组」命中。

test("F7 拼音归一化：汉字转拼音、大小写与分隔符全部折叠", () => {
  assert.equal(toPinyin("简南"), "jiannan")
  assert.equal(toPinyin("陆远征"), "luyuanzheng")
  assert.equal(toPinyin("JIAN NAN"), "jiannan")
  assert.equal(toPinyin("jian_nan"), "jiannan")
  assert.equal(toPinyin("简南_定妆照"), "jiannan")
})

test("F7b 拼音目录命中：JIAN NAN/简南_定妆照.png", () => {
  const hit = matchByFolder([f("JIAN NAN/简南_定妆照.png")], ["简南"])
  assert.deepEqual(hit["简南"], ["JIAN NAN/简南_定妆照.png"])
})

test("F7c 即梦默认文件名命中：角色名夹在年龄与外貌描述中间", () => {
  const name = "jimeng-2026-10-14-1992-34-year-old woman Jiang Nan, long face w....png"
  const hit = matchByFolder([f(name)], ["江楠"])
  assert.deepEqual(hit["江楠"], [name])
})

test("F7d 命中方式应为 py（真拼音命中），而不是降级的 fuzzy", () => {
  const name = "jimeng-2026-10-14-1992-34-year-old woman Jiang Nan, long face w....png"
  const m = matchFileToCharacter(f(name), ["江楠"])
  assert.equal(m?.kind, "py")
})

test("F7e 英文单词组切分：可识别空格分隔的多词拼音名", () => {
  const groups = wordGroups("34-year-old man Lu Yuanzheng, square")
  assert.ok(groups.includes("luyuanzheng"), "应切出 luyuanzheng，实际 " + groups.join("|"))
})

test("F7f 不同拼音不会互挂（简南 ≠ 江南）", () => {
  // 简南 = jiannan，江南 = jiangnan —— 差一个 g，绝不能互相命中
  const file = f("简南/正面.png")
  assert.equal(matchFileToCharacter(file, ["江南"]), null)
  assert.equal(matchFileToCharacter(file, ["简南"])?.kind, "zh")
})

test("F7f2 真同音字命中时降级为拼音，且中文原名的置信度更高", () => {
  // 剑南 与 简南 拼音完全相同（jiannan），纯拼音无法区分——这是算法边界。
  // 能做的两件事：1) 把置信度降为 py（界面可标注「靠拼音猜的」）
  //              2) 有中文原名可用时优先采信中文
  const file = f("简南/正面.png")
  assert.equal(matchFileToCharacter(file, ["剑南"])?.kind, "py")
  assert.equal(matchFileToCharacter(file, ["简南"])?.kind, "zh")
})

test("F7g 一张图只归一个角色：描述串同时像两个人时取更可信的", () => {
  // 文件名里同时出现「江楠」的拼音与另一个角色的完整拼音，
  // 应各归其位、且不重复挂
  const files = [f("jimeng-2026-10-14-9025-28-year-old woman Su Yao, oval face.png")]
  const detailed = matchByFolderDetailed(files, ["苏瑶", "江楠"])
  assert.equal(Object.keys(detailed).length, 1)
  assert.ok(detailed["苏瑶"])
  assert.equal(detailed["江楠"], undefined)
})

test("F7h 汇总信息：能说清挂了几张、靠什么规则、谁没命中（静默失败是最大的坑）", () => {
  const files = [f("JIAN NAN/简南_定妆照.png"), f("jimeng-...-woman Su Yao, oval.png")]
  const matched = matchByFolderDetailed(files, ["简南", "苏瑶", "陈砚"])
  const sum = summarizeAttach(files, ["简南", "苏瑶", "陈砚"], matched)
  assert.equal(sum.matchedCharacters, 2)
  assert.equal(sum.matchedFiles, 2)
  assert.deepEqual(sum.unmatched, ["陈砚"])
})

test("F7i 命中方式有中文说明，界面能直接展示", () => {
  assert.equal(describeMatchKind("zh"), "中文名")
  assert.equal(describeMatchKind("py"), "拼音")
})

test("F7j 无信息命名可被识别（即梦_19700101.png / 1/），供 AI 兜底按钮提示", () => {
  assert.equal(looksUninformative(f("即梦_19700101.png")), true)
  assert.equal(looksUninformative(f("1/2.png")), true)
  assert.equal(looksUninformative(f("JIAN NAN/简南_定妆照.png")), false)
})

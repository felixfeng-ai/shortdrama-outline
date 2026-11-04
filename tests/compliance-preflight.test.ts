import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import type { Act, Character, Episode } from "../lib/types.ts"
import type { Shot } from "../lib/assets/types.ts"
import { auditCompliance } from "../lib/compliance.ts"
import {
  AI_EXPORT_NOTICE,
  AI_GENERATION_LABEL,
  buildAiExportDisclosure,
} from "../lib/export/ai-disclosure.ts"
import {
  buildProjectPackageManifest,
} from "../lib/export/package.ts"
import { parseProjectPackage } from "../lib/export/import.ts"
import {
  buildStoryboardHtml,
  shotsToCsv,
  shotsToWorkList,
} from "../lib/assets/export.ts"
import { buildMarkdown } from "../lib/export.ts"
import { buildPlatformExportKit } from "../lib/export/platforms.ts"

const characters: Character[] = [{
  id: "char-1",
  name: "陈默",
  identity: "快递员",
  personality: "克制",
  motivation: "拿回女儿的手术费",
  arc: "从只想活命到愿意承担代价",
}]

const acts: Act[] = [{
  id: "act-1",
  key: "setup",
  title: "最后一单",
  summary: "陈默接下一封不能拆的信",
  beats: ["雨夜送信"],
}]

const episodes: Episode[] = [{
  id: "ep-1",
  number: 1,
  title: "最后一单",
  synopsis: "陈默冒雨送信，发现收件人已经去世。",
  hook: "他转身时，门内传来死者自己的声音。",
  intensity: 3,
}]

const shot: Shot = {
  id: "shot-row-1",
  entityId: "shot-1",
  shot: 1,
  episode: 1,
  scene: "楼道",
  characters: ["陈默"],
  action: "陈默敲门",
  speaker: "",
  dialogue: "",
  place: "旧楼",
  shotSize: "中景",
  camera: "固定",
  prompt: "cinematic delivery man at a door",
  refImages: [],
  missingRefFor: [],
  params: { ratio: "9:16", duration: 10, lastFrame: false },
  status: "todo",
}

function compliantInput() {
  return {
    title: "最后一单",
    idea: "快递员意外继承一笔遗产，却被要求完成七桩交易。",
    characters,
    episodes,
    shots: [shot],
    sourceMaterials: [],
  }
}

test("CP1 正常项目不制造内容命中", () => {
  const result = auditCompliance(compliantInput())
  assert.equal(result.counts.warning, 0)
  assert.equal(result.counts.info, 0)
  assert.deepEqual(result.issues, [])
  assert.equal(result.disclosure.label, AI_GENERATION_LABEL)
  assert.match(result.disclosure.notice, /AI 生成/)
})

test("CP2 明确高风险表达能定位到分集与镜头并带证据", () => {
  const result = auditCompliance({
    ...compliantInput(),
    episodes: [{
      ...episodes[0],
      hook: "她把一段诈骗教程发进群里，让所有人照着操作。",
    }],
    shots: [{
      ...shot,
      action: "角色展示炸弹制作步骤和所需材料",
    }],
  })

  assert.ok(result.counts.warning >= 2)
  assert.ok(result.issues.some((issue) =>
    issue.code === "illegal-instruction"
    && issue.episode === 1
    && /诈骗教程/.test(issue.evidence)
  ))
  assert.ok(result.issues.some((issue) =>
    issue.code === "illegal-instruction"
    && issue.shot === 1
    && /炸弹制作/.test(issue.evidence)
  ))
})

test("CP3 原文素材只提醒授权，不回传全文", () => {
  const result = auditCompliance({
    ...compliantInput(),
    sourceMaterials: [{
      name: "未公开小说.txt",
      content: "这是一段不应出现在预检证据里的长篇原文。",
    }],
  })
  const rights = result.issues.find((issue) => issue.code === "source-rights-review")
  assert.ok(rights)
  assert.match(rights.evidence, /1 份原文/)
  assert.doesNotMatch(JSON.stringify(result), /不应出现在预检证据/)
})

test("CP4 AI 声明包含固定标签、来源路径与素材数量", () => {
  const disclosure = buildAiExportDisclosure({
    assetCount: 3,
    providers: ["aliyun", "aliyun", "other"],
  })
  assert.equal(disclosure.label, "AI 生成")
  assert.equal(disclosure.notice, AI_EXPORT_NOTICE)
  assert.equal(disclosure.provenancePath, "ai-provenance.json")
  assert.equal(disclosure.assetCount, 3)
  assert.deepEqual(disclosure.providers, ["aliyun", "other"])
})

test("CP5 project.json 与旧包读取都保留 AI 声明兼容", () => {
  const manifest = buildProjectPackageManifest({
    project: { id: "p1", title: "测试" },
    mode: "delivery",
    exportedAt: 1,
    projectSettings: {
      genre: "悬疑",
      episodeCount: 1,
      brief: {
        premise: "", payoff: "", destination: "", emotion: "",
        audience: "", references: "", redline: "",
      },
      look: { palette: "", light: "", lens: "", banned: "" },
      judgments: [],
    },
    story: {},
    assets: {},
    refs: [],
    ai: buildAiExportDisclosure({ assetCount: 0 }),
  })
  assert.equal(manifest.ai.label, "AI 生成")
  assert.equal(manifest.ai.provenancePath, "ai-provenance.json")

  const old = {
    ...manifest,
    schemaVersion: 2,
    ai: undefined,
    materials: undefined,
    files: undefined,
    warnings: undefined,
  }
  const parsed = parseProjectPackage(old)
  assert.equal(parsed.ai.label, "AI 生成")
})

test("CP6 HTML、Markdown、CSV 与执行单都有可见 AI 标识", () => {
  const html = buildStoryboardHtml({
    title: "最后一单",
    visuals: [],
    scenes: [],
    shots: [shot],
  })
  assert.match(html, /AI 生成/)
  assert.match(html, /ai-provenance\.json/)

  const markdown = buildMarkdown({ idea: "测试", characters, acts, episodes })
  assert.match(markdown, /AI 生成标识/)
  assert.match(markdown, /ai-provenance\.json/)

  const csv = shotsToCsv([shot])
  assert.match(csv, /AI 生成标识/)
  assert.match(csv, /AI 生成/)

  const workList = shotsToWorkList([shot])
  assert.match(workList, /AI 生成标识/)
  assert.match(workList, /ai-provenance\.json/)
})

test("CP7 平台交付 manifest 与执行单沿用同一 AI 声明", () => {
  const kit = buildPlatformExportKit({
    title: "最后一单",
    target: "json",
    shots: [shot],
    exportedAt: 1,
    ai: buildAiExportDisclosure({ assetCount: 1, providers: ["aliyun"] }),
  })
  assert.equal(kit.manifest.ai.label, "AI 生成")
  assert.equal(kit.manifest.ai.provenancePath, "ai-provenance.json")
  const list = kit.files.find((file) => file.path.endsWith("shotlist.txt"))!.content
  assert.match(list, /AI 生成标识/)
})

test("CP8 工作台接入合规预检和 AI 来源说明", () => {
  const page = fs.readFileSync("app/page.tsx", "utf8")
  const meta = fs.readFileSync("components/WorkMeta.tsx", "utf8")
  const panel = fs.readFileSync("components/CompliancePanel.tsx", "utf8")
  const bar = fs.readFileSync("components/ProjectBar.tsx", "utf8")
  assert.match(page, /auditCompliance/)
  assert.match(page, /CompliancePanel/)
  assert.match(page, /buildAiExportDisclosure/)
  assert.match(meta, /合规预检/)
  assert.match(panel, /不构成法律意见/)
  assert.match(bar, /AI 来源清单/)
})
